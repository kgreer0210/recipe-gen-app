import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "./support/fakeSupabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  beginBusyWeekBatch: vi.fn(),
  settleBusyWeekBatch: vi.fn(),
  recordUsageTokens: vi.fn(),
  getUsageStatus: vi.fn(),
  chatJson: vi.fn(),
  adminClient: { current: null as unknown },
  failCuisines: { current: new Set<string>() },
  /** What the plan (per the database contract) says the next reservation returns. */
  reservation: {
    current: {
      allowed: true,
      planKey: "plus",
      reason: undefined as string | undefined,
      remaining: 97 as number | null,
      windowStart: "2026-10-26T04:00:00.000Z" as string | null,
    },
  },
  /** Every refund the database function would have made: count and the week bucket it went to. */
  refunds: [] as Array<{ userId: string; count: number; windowStart: string | null }>,
  /** Makes the next settle fail the way a failed release_usage call does: nothing is written. */
  refundFails: { current: false },
}));

vi.mock("@/lib/supabase/auth-helper", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mocks.adminClient.current,
}));

vi.mock("@/lib/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/usage")>();
  return {
    ...actual,
    beginBusyWeekBatch: mocks.beginBusyWeekBatch,
    settleBusyWeekBatch: mocks.settleBusyWeekBatch,
    recordUsageTokens: mocks.recordUsageTokens,
    getUsageStatus: mocks.getUsageStatus,
  };
});

vi.mock("@/lib/openrouter/chatJson", () => ({ chatJson: mocks.chatJson }));

import { POST } from "@/app/api/busy-week/route";
import { GET } from "@/app/api/busy-week/[batchId]/route";

const USER = { id: "user-1", email: "cook@example.com" };
const OTHER_USER_ID = "user-2";
const WEEK = "2026-10-26";
const WINDOW = "2026-10-26T04:00:00.000Z";
const BATCH = "3f0c9c2e-6a1e-4c7e-9a55-1f2b3c4d5e6f";
const SECOND_BATCH = "8a7b6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d";
/** Mirrors BUSY_WEEK_DEADLINE_MS in src/lib/busyWeekBatch.ts. The route must answer before maxDuration (300s). */
const DEADLINE_MS = 240_000;
const REFUNDABLE = ["generation_failed", "save_failed", "interrupted"];
const PLACED = ["placed", "replaced", "unscheduled"];

let db: FakeDb;
let nextId = 0;

function newId(prefix: string) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function recipeJson(title: string) {
  return {
    title,
    description: `${title} description`,
    ingredients: [{ name: "rice", amount: 1, unit: "cup", category: "Pantry" }],
    instructions: ["Cook."],
    tags: { cuisine: "Thai", meal: "Dinner", protein: "Chicken" },
    prepTime: "10 minutes",
    cookTime: "20 minutes",
  };
}

function busyBody(overrides: Record<string, unknown> = {}) {
  return {
    batchId: BATCH,
    weekStart: WEEK,
    picks: [
      { cuisine: "Thai", dayOfWeek: 0 },
      { cuisine: "Italian", mealStyle: "Pasta", dayOfWeek: 2 },
      { cuisine: "Mexican", mealStyle: "Taco", dayOfWeek: 4 },
    ],
    ...overrides,
  };
}

function postBusyWeek(body: unknown) {
  return POST(
    new Request("http://localhost/api/busy-week", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

function getBusyWeek(batchId: string) {
  return GET(new Request(`http://localhost/api/busy-week/${batchId}`), {
    params: Promise.resolve({ batchId }),
  });
}

function promptsSent(): string[] {
  return mocks.chatJson.mock.calls.map((call) => call[1] as string);
}

function planRows() {
  return db.tables.weekly_plan ?? [];
}

function batchRows() {
  return db.tables.generation_batches ?? [];
}

function refundCounts(): number[] {
  return mocks.refunds.map((refund) => refund.count);
}

type StoredPick = {
  index: number;
  cuisine: string;
  mealStyle: string;
  dayOfWeek: number;
  status: string;
  recipeId: string | null;
  planSlotId: string | null;
  error?: string;
  replaceSlotId?: string;
};

/**
 * The database side of begin_busy_week_batch: insert the batch row (primary key is the
 * idempotency check), then reserve. A blocked reservation leaves the row as failed.
 */
function emulateBegin(args: {
  batchId: string;
  user: { id: string };
  weekStart: string;
  count: number;
  results: StoredPick[];
}) {
  if (batchRows().some((row) => row.id === args.batchId)) return { outcome: "duplicate" as const };
  const row: Record<string, unknown> = {
    id: args.batchId,
    user_id: args.user.id,
    week_start: args.weekStart,
    status: "running",
    requested: args.count,
    succeeded: 0,
    refunded: 0,
    results: args.results,
    usage_window_start: null,
    created_at: new Date().toISOString(),
  };
  db.tables.generation_batches = [...batchRows(), row];

  const isAdmin = process.env.ADMIN_USER_ID === args.user.id;
  if (isAdmin) return { outcome: "started" as const, planKey: "admin", windowStart: null, remaining: null };

  const reservation = mocks.reservation.current;
  if (!reservation.allowed) {
    row.status = "failed";
    row.results = [];
    return {
      outcome: "blocked" as const,
      reason: reservation.reason ?? "insufficient_remaining",
      planKey: reservation.planKey,
      remaining: reservation.remaining,
    };
  }
  row.usage_window_start = reservation.windowStart;
  return {
    outcome: "started" as const,
    planKey: reservation.planKey,
    windowStart: reservation.windowStart,
    remaining: reservation.remaining,
  };
}

/**
 * The database side of settle_busy_week_batch. Runs as one transaction: lock the batch,
 * optionally interrupt pending picks, refund failed picks not yet refunded, finish the
 * batch. Nothing is written if the refund fails.
 */
function emulateSettle(batchId: string, interruptPending: boolean) {
  const row = batchRows().find((item) => item.id === batchId);
  if (!row) return { ok: true as const, settled: false, reason: "not_found" };
  if (row.status !== "running") {
    return { ok: true as const, settled: false, reason: "already_settled", status: row.status as string, refunded: row.refunded as number };
  }
  const picks = row.results as StoredPick[];
  if (picks.some((pick) => pick.status === "pending") && !interruptPending) {
    return { ok: true as const, settled: false, reason: "pending_picks" };
  }
  const repaired = picks.map((pick): StoredPick => {
    if (pick.status !== "pending") return pick;
    if (pick.recipeId) return { ...pick, status: "unscheduled", error: "plan_insert_failed" };
    return { ...pick, status: "failed", error: "interrupted" };
  });
  const refundable = repaired.filter((pick) => pick.status === "failed" && REFUNDABLE.includes(pick.error ?? "")).length;
  const succeeded = repaired.filter((pick) => PLACED.includes(pick.status)).length;
  const status = succeeded === row.requested ? "completed" : succeeded === 0 ? "failed" : "partial";
  const delta = refundable - ((row.refunded as number) ?? 0);

  if (delta > 0 && row.usage_window_start) {
    if (mocks.refundFails.current) {
      return { ok: false as const, error: "release_usage failed" };
    }
    mocks.refunds.push({ userId: row.user_id as string, count: delta, windowStart: row.usage_window_start as string });
  }

  Object.assign(row, { status, succeeded, results: repaired, refunded: refundable });
  return { ok: true as const, settled: true, status, refunded: refundable };
}

/** The database side of place_busy_week_dinner, run as the signed-in user. */
function emulatePlace(args: Record<string, unknown>) {
  const rows = (db.tables.weekly_plan ??= []);
  const recipeId = args.p_recipe_id as string;
  if (!(db.tables.recipes ?? []).some((recipe) => recipe.id === recipeId && recipe.user_id === USER.id)) {
    return { data: null, error: { message: "recipe not found" } };
  }
  const day = args.p_day_of_week as number;
  const replaceId = (args.p_replace_slot_id as string | null) ?? null;
  const occupant = rows.find(
    (row) =>
      row.user_id === USER.id &&
      row.week_start === args.p_week_start &&
      row.day_of_week === day &&
      row.meal_slot === "dinner"
  );
  const status = !occupant ? "placed" : replaceId && occupant.id === replaceId ? "replaced" : "slot_taken";
  if (occupant && status === "replaced") rows.splice(rows.indexOf(occupant), 1);

  const slot = {
    id: newId("slot"),
    user_id: USER.id,
    recipe_id: recipeId,
    week_start: args.p_week_start,
    day_of_week: status === "slot_taken" ? null : day,
    meal_slot: status === "slot_taken" ? null : "dinner",
    servings_override: args.p_servings,
    cooked_at: null,
    created_at: new Date().toISOString(),
  };
  rows.push(slot);
  return { data: { status, slot }, error: null };
}

describe("busy week route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextId = 0;
    mocks.refunds.length = 0;
    mocks.refundFails.current = false;
    mocks.reservation.current = {
      allowed: true,
      planKey: "plus",
      reason: undefined,
      remaining: 97,
      windowStart: WINDOW,
    };
    db = { tables: { user_settings: [], recipes: [], weekly_plan: [], generation_batches: [] } };
    db.rpc = (name, args) => (name === "place_busy_week_dinner" ? emulatePlace(args) : { data: null, error: { message: name } });
    const client = createFakeSupabase(db);
    mocks.adminClient.current = client;
    mocks.getAuthenticatedUser.mockResolvedValue({ user: USER, supabase: client });
    mocks.beginBusyWeekBatch.mockImplementation(async (args) => emulateBegin(args));
    mocks.settleBusyWeekBatch.mockImplementation(async (batchId: string, interruptPending: boolean) => {
      try {
        return emulateSettle(batchId, interruptPending);
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    });
    mocks.recordUsageTokens.mockResolvedValue(undefined);
    mocks.getUsageStatus.mockResolvedValue({ generate: { remaining: 97 } });
    mocks.failCuisines.current = new Set();
    mocks.chatJson.mockImplementation(async (_system: string, prompt: string) => {
      const cuisine = /Cuisine: (.+)/.exec(prompt)?.[1]?.trim() ?? "Unknown";
      if (mocks.failCuisines.current.has(cuisine)) {
        throw new Error("model timed out");
      }
      const title = `${cuisine} dish ${mocks.chatJson.mock.calls.length}`;
      return { data: recipeJson(title), modelUsed: "m", usage: { totalTokens: 120 } };
    });
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_ID;
  });

  describe("POST /api/busy-week validation", () => {
    it.each([
      ["zero picks", busyBody({ picks: [] })],
      [
        "eight picks",
        busyBody({
          picks: [0, 1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({ cuisine: "Thai", dayOfWeek })),
        }),
      ],
      [
        "duplicate days",
        busyBody({
          picks: [
            { cuisine: "Thai", dayOfWeek: 1 },
            { cuisine: "Italian", dayOfWeek: 1 },
          ],
        }),
      ],
      ["a non-Monday week start", busyBody({ weekStart: "2026-10-27" })],
      ["an unknown style", busyBody({ picks: [{ cuisine: "Thai", mealStyle: "Burrito bowl deluxe", dayOfWeek: 0 }] })],
      ["an unknown cuisine", busyBody({ picks: [{ cuisine: "Klingon", dayOfWeek: 0 }] })],
    ])("returns 400 for %s without starting a batch or calling the model", async (_label, body) => {
      const response = await postBusyWeek(body);

      expect(response.status).toBe(400);
      expect(mocks.beginBusyWeekBatch).not.toHaveBeenCalled();
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("returns 401 when nobody is signed in", async () => {
      mocks.getAuthenticatedUser.mockResolvedValueOnce({ user: null, supabase: null });

      const response = await postBusyWeek(busyBody());

      expect(response.status).toBe(401);
      expect(mocks.beginBusyWeekBatch).not.toHaveBeenCalled();
    });
  });

  describe("paid plan and limits", () => {
    it("refuses a free user with 403, makes no model calls and refunds nothing", async () => {
      mocks.reservation.current = { allowed: false, planKey: "free", reason: "paid_plan_required", remaining: null, windowStart: null };

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.reason).toBe("paid_plan_required");
      expect(mocks.chatJson).not.toHaveBeenCalled();
      expect(mocks.refunds).toHaveLength(0);
    });

    it("returns 429 with what is left when the batch does not fit, before any model call", async () => {
      mocks.reservation.current = { allowed: false, planKey: "plus", reason: "insufficient_remaining", remaining: 2, windowStart: null };

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.reason).toBe("insufficient_remaining");
      expect(json.remaining).toBe(2);
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("reserves all picks up front, as a single batch, in the same database call that records the batch", async () => {
      await postBusyWeek(busyBody());

      expect(mocks.beginBusyWeekBatch).toHaveBeenCalledTimes(1);
      expect(mocks.beginBusyWeekBatch).toHaveBeenCalledWith(
        expect.objectContaining({ batchId: BATCH, weekStart: WEEK, count: 3, user: USER })
      );
    });

    it("answers a request with an admin bypass the same way as a paid user, with no weekly count", async () => {
      process.env.ADMIN_USER_ID = USER.id;
      mocks.getUsageStatus.mockResolvedValueOnce({ generate: { remaining: null } });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.usage.remaining).toBeNull();
      expect(mocks.refunds).toHaveLength(0);
    });
  });

  describe("running a batch", () => {
    it("saves every dinner and places each one when all succeed", async () => {
      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("completed");
      expect(json.usage).toMatchObject({ reserved: 3, refunded: 0 });
      expect(json.results.map((r: { status: string }) => r.status)).toEqual(["placed", "placed", "placed"]);
      expect(db.tables.recipes).toHaveLength(3);
      expect(planRows().map((row) => row.day_of_week).sort()).toEqual([0, 2, 4]);
      expect(mocks.refunds).toHaveLength(0);
    });

    it("records the reserved week bucket on the batch so an interrupted batch can be refunded later", async () => {
      await postBusyWeek(busyBody());

      expect(batchRows().find((row) => row.id === BATCH)).toMatchObject({ usage_window_start: WINDOW });
    });

    it("keeps the successful dinners and refunds only the failed ones when some generations fail", async () => {
      mocks.failCuisines.current = new Set(["Greek", "Korean"]);

      const response = await postBusyWeek(
        busyBody({
          picks: [
            { cuisine: "Thai", dayOfWeek: 0 },
            { cuisine: "Greek", dayOfWeek: 1 },
            { cuisine: "Italian", dayOfWeek: 2 },
            { cuisine: "Korean", dayOfWeek: 3 },
            { cuisine: "Mexican", dayOfWeek: 4 },
          ],
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("partial");
      expect(json.results.filter((r: { status: string }) => r.status === "placed")).toHaveLength(3);
      expect(json.results.filter((r: { status: string }) => r.status === "failed").map((r: { error: string }) => r.error)).toEqual([
        "generation_failed",
        "generation_failed",
      ]);
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 2, windowStart: WINDOW }]);
      expect(mocks.recordUsageTokens).toHaveBeenCalledTimes(5);
    });

    it("marks the batch failed and refunds everything when no dinner can be made", async () => {
      mocks.failCuisines.current = new Set(["Thai", "Italian", "Mexican"]);

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(json.status).toBe("failed");
      expect(json.usage.refunded).toBe(3);
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 3, windowStart: WINDOW }]);
      expect(planRows()).toHaveLength(0);
    });

    it("keeps the original dinner when a confirmed replacement fails to generate", async () => {
      db.tables.recipes.push({ id: "old-recipe", user_id: USER.id, title: "Old Tikka" });
      db.tables.weekly_plan.push({
        id: "old-slot",
        user_id: USER.id,
        recipe_id: "old-recipe",
        week_start: WEEK,
        day_of_week: 0,
        meal_slot: "dinner",
        servings_override: 2,
        cooked_at: null,
      });
      mocks.failCuisines.current = new Set(["Thai"]);

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0, replaceSlotId: "old-slot" }] }));
      const json = await response.json();

      expect(json.results[0].status).toBe("failed");
      expect(planRows().map((row) => row.id)).toContain("old-slot");
      expect(db.tables.recipes.map((row) => row.id)).toContain("old-recipe");
    });

    it("replaces a confirmed dinner, keeping the old recipe in the collection", async () => {
      db.tables.recipes.push({ id: "old-recipe", user_id: USER.id, title: "Old Tikka" });
      db.tables.weekly_plan.push({
        id: "old-slot",
        user_id: USER.id,
        recipe_id: "old-recipe",
        week_start: WEEK,
        day_of_week: 0,
        meal_slot: "dinner",
        servings_override: 2,
        cooked_at: null,
      });

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0, replaceSlotId: "old-slot" }] }));
      const json = await response.json();

      expect(json.results[0].status).toBe("replaced");
      expect(planRows().find((row) => row.id === "old-slot")).toBeUndefined();
      expect(planRows().filter((row) => row.day_of_week === 0)).toHaveLength(1);
      expect(db.tables.recipes.map((row) => row.id)).toContain("old-recipe");
    });

    it("does not overwrite a day that was filled by something else, and does not refund the saved dinner", async () => {
      db.tables.recipes.push({ id: "other-recipe", user_id: USER.id, title: "Filled Elsewhere" });
      db.tables.weekly_plan.push({
        id: "other-slot",
        user_id: USER.id,
        recipe_id: "other-recipe",
        week_start: WEEK,
        day_of_week: 0,
        meal_slot: "dinner",
        servings_override: 2,
        cooked_at: null,
      });

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "unscheduled", error: "slot_taken" });
      expect(planRows().find((row) => row.id === "other-slot")).toBeDefined();
      expect(db.tables.recipes).toHaveLength(2);
      expect(mocks.refunds).toHaveLength(0);
    });

    it("sends a dinner to the tray when another tab fills its day after it was confirmed", async () => {
      db.tables.recipes.push({ id: "old-recipe", user_id: USER.id, title: "Old Tikka" });
      db.tables.weekly_plan.push({
        id: "old-slot",
        user_id: USER.id,
        recipe_id: "old-recipe",
        week_start: WEEK,
        day_of_week: 0,
        meal_slot: "dinner",
        servings_override: 2,
        cooked_at: null,
      });
      // While the model works, another device swaps the day's dinner for a different one.
      mocks.chatJson.mockImplementationOnce(async () => {
        db.tables.weekly_plan = planRows().filter((row) => row.id !== "old-slot");
        db.tables.recipes.push({ id: "other-recipe", user_id: USER.id, title: "Filled Elsewhere" });
        db.tables.weekly_plan.push({
          id: "other-slot",
          user_id: USER.id,
          recipe_id: "other-recipe",
          week_start: WEEK,
          day_of_week: 0,
          meal_slot: "dinner",
          servings_override: 2,
          cooked_at: null,
        });
        return { data: recipeJson("Thai dish"), modelUsed: "m", usage: { totalTokens: 120 } };
      });

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0, replaceSlotId: "old-slot" }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "unscheduled", error: "slot_taken" });
      expect(planRows().find((row) => row.id === "other-slot")).toBeDefined();
      expect(planRows().filter((row) => row.day_of_week === 0)).toHaveLength(1);
      expect(mocks.refunds).toHaveLength(0);
    });

    it("sends a dinner to the tray with no refund when the placement call fails after the recipe is saved", async () => {
      db.rpc = () => ({ data: null, error: { message: "boom" } });

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "unscheduled", error: "plan_insert_failed" });
      expect(db.tables.recipes).toHaveLength(1);
      expect(mocks.refunds).toHaveLength(0);
    });

    it("refunds a pick whose recipe could not be saved", async () => {
      db.failInsert = (table) => (table === "recipes" ? { code: "P0001", message: "mise_blocked:save_limit" } : null);

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "failed", error: "save_failed" });
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 1, windowStart: WINDOW }]);
    });

    it("sends a second dinner of the same cuisine the first dish's title to avoid", async () => {
      const response = await postBusyWeek(
        busyBody({
          picks: [
            { cuisine: "Mexican", mealStyle: "Taco", dayOfWeek: 0 },
            { cuisine: "Mexican", mealStyle: "Bowl", dayOfWeek: 2 },
          ],
        })
      );
      const json = await response.json();
      const firstTitle = json.results[0].recipe.title as string;

      const prompts = promptsSent();
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toContain(`avoid these dishes: ${firstTitle}`);
      expect(prompts[0]).not.toContain("avoid these dishes");
    });

    it("lets the model choose the protein for busy-week picks", async () => {
      await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));

      expect(promptsSent()[0]).toContain("Chef's choice");
    });

    it("records token usage for every attempt, including failures", async () => {
      mocks.failCuisines.current = new Set(["Thai"]);

      await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }, { cuisine: "Italian", dayOfWeek: 1 }] }));

      expect(mocks.recordUsageTokens).toHaveBeenCalledTimes(2);
      expect(mocks.recordUsageTokens).toHaveBeenCalledWith("generate", USER, 120);
    });

    it("returns 409 for a batch id that already exists, and does not reserve or call the model again", async () => {
      batchRows().push({
        id: BATCH,
        user_id: USER.id,
        week_start: WEEK,
        status: "running",
        requested: 3,
        succeeded: 0,
        refunded: 0,
        results: [],
        usage_window_start: WINDOW,
        created_at: new Date().toISOString(),
      });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.batchId).toBe(BATCH);
      expect(mocks.chatJson).not.toHaveBeenCalled();
      expect(mocks.refunds).toHaveLength(0);
    });

    it("says the batch failed to finish, with its id, when the settle call fails, and does not report it complete", async () => {
      mocks.refundFails.current = true;
      mocks.failCuisines.current = new Set(["Thai"]);

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.batchId).toBe(BATCH);
      expect(json.status).toBeUndefined();
      expect(batchRows().find((row) => row.id === BATCH)).toMatchObject({ status: "running", refunded: 0 });
    });
  });

  describe("interrupted batches", () => {
    /** A batch the function started, placed one dinner in, and never settled. */
    function seedInterrupted(createdAt: string, results: StoredPick[]) {
      batchRows().push({
        id: SECOND_BATCH,
        user_id: USER.id,
        week_start: WEEK,
        status: "running",
        requested: results.length,
        succeeded: 0,
        refunded: 0,
        usage_window_start: WINDOW,
        results,
        created_at: createdAt,
      });
    }

    it("refunds a pick that was saved as failed before the function died, on the next read (window A)", async () => {
      seedInterrupted(new Date().toISOString(), [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId: "recipe-a", planSlotId: null },
        { index: 1, cuisine: "Italian", mealStyle: "Any", dayOfWeek: 2, status: "failed", recipeId: null, planSlotId: null, error: "generation_failed" },
      ]);

      const json = await (await getBusyWeek(SECOND_BATCH)).json();

      expect(json.status).toBe("partial");
      expect(json.usage.refunded).toBe(1);
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 1, windowStart: WINDOW }]);
    });

    it("does not refund the same failed pick twice when reads repeat", async () => {
      seedInterrupted(new Date().toISOString(), [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "failed", recipeId: null, planSlotId: null, error: "save_failed" },
        { index: 1, cuisine: "Italian", mealStyle: "Any", dayOfWeek: 2, status: "placed", recipeId: "recipe-b", planSlotId: null },
      ]);

      await getBusyWeek(SECOND_BATCH);
      await getBusyWeek(SECOND_BATCH);
      const json = await (await getBusyWeek(SECOND_BATCH)).json();

      expect(refundCounts()).toEqual([1]);
      expect(json.usage.refunded).toBe(1);
    });

    it("refunds picks that never finished once the batch is stale, and keeps picks that saved a recipe (window B)", async () => {
      seedInterrupted(new Date(Date.now() - 10 * 60_000).toISOString(), [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId: null, planSlotId: null },
        { index: 1, cuisine: "Italian", mealStyle: "Any", dayOfWeek: 2, status: "pending", recipeId: null, planSlotId: null },
        { index: 2, cuisine: "Mexican", mealStyle: "Taco", dayOfWeek: 4, status: "pending", recipeId: "recipe-c", planSlotId: null },
      ]);

      const json = await (await getBusyWeek(SECOND_BATCH)).json();

      expect(json.status).toBe("partial");
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 1, windowStart: WINDOW }]);
      expect(json.results.map((r: { error?: string }) => r.error)).toEqual([undefined, "interrupted", "plan_insert_failed"]);
    });

    it("leaves a live batch's pending picks alone", async () => {
      seedInterrupted(new Date().toISOString(), [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "pending", recipeId: null, planSlotId: null },
      ]);

      const json = await (await getBusyWeek(SECOND_BATCH)).json();

      expect(json.status).toBe("running");
      expect(mocks.refunds).toHaveLength(0);
    });

    it("retries a refund that failed: the batch stays running until the refund lands, and is refunded once", async () => {
      mocks.refundFails.current = true;
      mocks.failCuisines.current = new Set(["Greek", "Korean"]);
      const response = await postBusyWeek(
        busyBody({
          batchId: SECOND_BATCH,
          picks: [
            { cuisine: "Greek", dayOfWeek: 1 },
            { cuisine: "Korean", dayOfWeek: 3 },
          ],
        })
      );
      expect(response.status).toBe(500);
      expect(mocks.refunds).toHaveLength(0);

      mocks.refundFails.current = false;
      const json = await (await getBusyWeek(SECOND_BATCH)).json();

      expect(json.status).toBe("failed");
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 2, windowStart: WINDOW }]);
      await getBusyWeek(SECOND_BATCH);
      expect(refundCounts()).toEqual([2]);
    });
  });

  describe("time budget and concurrency", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("stops starting dinners at the batch deadline: they fail and are refunded, and the request ends before maxDuration", async () => {
      // Every model call hangs. Seven repeats of one cuisine would take 7 x 90s if they ran one after another.
      mocks.chatJson.mockImplementation(() => new Promise(() => {}));
      const sevenThai = Array.from({ length: 7 }, (_, dayOfWeek) => ({ cuisine: "Thai", dayOfWeek }));
      const started = Date.now();

      const pending = postBusyWeek(busyBody({ picks: sevenThai }));
      await vi.runAllTimersAsync();
      const response = await pending;
      const json = await response.json();

      expect(Date.now() - started).toBeLessThanOrEqual(DEADLINE_MS);
      expect(mocks.chatJson).toHaveBeenCalledTimes(3);
      expect(json.status).toBe("failed");
      expect(json.results.every((r: { error?: string }) => r.error === "generation_failed")).toBe(true);
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 7, windowStart: WINDOW }]);
    });

    it("gives a slow model its own failed dinner and keeps the rest of the batch", async () => {
      mocks.chatJson.mockImplementation(async (_system: string, prompt: string) => {
        if (prompt.includes("Cuisine: Thai")) return new Promise(() => {});
        return { data: recipeJson("Italian dish"), modelUsed: "m", usage: { totalTokens: 120 } };
      });

      const pending = postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }, { cuisine: "Italian", dayOfWeek: 2 }] }));
      await vi.runAllTimersAsync();
      const json = await (await pending).json();

      expect(json.status).toBe("partial");
      expect(json.results.map((r: { status: string }) => r.status)).toEqual(["failed", "placed"]);
      expect(mocks.refunds).toEqual([{ userId: USER.id, count: 1, windowStart: WINDOW }]);
    });

    it("runs at most four dinners at once", async () => {
      let inFlight = 0;
      let peak = 0;
      mocks.chatJson.mockImplementation(async (_system: string, prompt: string) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        inFlight -= 1;
        return { data: recipeJson(`${prompt.length} dish`), modelUsed: "m", usage: { totalTokens: 120 } };
      });
      const sixCuisines = ["Thai", "Italian", "Mexican", "Greek", "Korean", "Indian"].map((cuisine, dayOfWeek) => ({
        cuisine,
        dayOfWeek,
      }));

      const pending = postBusyWeek(busyBody({ picks: sixCuisines }));
      await vi.runAllTimersAsync();
      const json = await (await pending).json();

      expect(json.status).toBe("completed");
      expect(peak).toBe(4);
    });
  });

  describe("protein", () => {
    const seedSettings = (dietary: string[]) => {
      db.tables.user_settings = [{ user_id: USER.id, dietary_preferences: dietary, disliked_ingredients: [], default_servings: 2 }];
    };

    it("rejects an unknown protein with 400, before any batch or reservation", async () => {
      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Dragon", dayOfWeek: 0 }] }));

      expect(response.status).toBe(400);
      expect(mocks.beginBusyWeekBatch).not.toHaveBeenCalled();
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("sends the chosen protein into the prompt, and leaves Any and a missing protein as the AI's choice", async () => {
      await postBusyWeek(
        busyBody({
          picks: [
            { cuisine: "Thai", protein: "Beef", dayOfWeek: 0 },
            { cuisine: "Italian", protein: "Any", dayOfWeek: 2 },
            { cuisine: "Mexican", dayOfWeek: 4 },
          ],
        })
      );
      const promptFor = (cuisine: string) => promptsSent().find((prompt) => prompt.includes(`Cuisine: ${cuisine}\n`)) ?? "";
      const beef = promptFor("Thai");
      const any = promptFor("Italian");
      const missing = promptFor("Mexican");

      expect(beef).toContain("Protein (base): Beef");
      expect(beef).toContain("tags must exactly match (Thai, Dinner, Beef).");
      expect(any).toContain("Protein (base): Chef's choice.");
      expect(missing).toContain("Protein (base): Chef's choice.");
    });

    it("stores the protein with each pick and returns it in the results", async () => {
      const response = await postBusyWeek(
        busyBody({
          picks: [
            { cuisine: "Thai", protein: "Tofu", dayOfWeek: 0 },
            { cuisine: "Italian", dayOfWeek: 2 },
          ],
        })
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.results.map((r: { protein: string }) => r.protein)).toEqual(["Tofu", "Any"]);
      expect(batchRows().find((row) => row.id === BATCH)?.results).toMatchObject([
        { protein: "Tofu" },
        { protein: "Any" },
      ]);
    });

    it("refuses a meat pick for a saved vegetarian, with 400, zero reservation and zero model calls", async () => {
      seedSettings(["Vegetarian"]);

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Chicken", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toContain("say vegetarian");
      expect(json.error).toContain("Chicken");
      expect(mocks.beginBusyWeekBatch).not.toHaveBeenCalled();
      expect(mocks.chatJson).not.toHaveBeenCalled();
      expect(batchRows()).toHaveLength(0);
    });

    it("refuses Eggs for a saved vegan, but allows Eggs for a saved vegetarian", async () => {
      seedSettings(["vegan"]);
      const vegan = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Eggs", dayOfWeek: 0 }] }));
      expect(vegan.status).toBe(400);

      seedSettings(["Vegetarian"]);
      const vegetarian = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Eggs", dayOfWeek: 0 }] }));
      expect(vegetarian.status).toBe(200);
    });

    it("applies a saved vegetarian preference to a pick that asks for Vegetarian, and it stays vegetarian", async () => {
      seedSettings(["Vegetarian"]);

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Vegetarian (no meat)", dayOfWeek: 0 }] }));

      expect(response.status).toBe(200);
      expect(promptsSent()[0]).toContain("This must be a vegetarian dish with no meat, poultry or fish.");
    });

    it("keeps the chosen protein on the stored pick for Retry failed to re-send", async () => {
      mocks.failCuisines.current = new Set(["Thai"]);
      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", protein: "Pork", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "failed", protein: "Pork" });
    });
  });
});

describe("GET /api/busy-week/[batchId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refunds.length = 0;
    mocks.refundFails.current = false;
    mocks.reservation.current = { allowed: true, planKey: "plus", reason: undefined, remaining: 97, windowStart: WINDOW };
    db = { tables: { user_settings: [], recipes: [], weekly_plan: [], generation_batches: [] } };
    const client = createFakeSupabase(db);
    mocks.adminClient.current = client;
    mocks.getAuthenticatedUser.mockResolvedValue({ user: USER, supabase: client });
    mocks.settleBusyWeekBatch.mockImplementation(async (batchId: string, interruptPending: boolean) => {
      try {
        return emulateSettle(batchId, interruptPending);
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    });
    mocks.getUsageStatus.mockResolvedValue({ generate: { remaining: 97 } });
  });

  it("returns 401 when nobody is signed in", async () => {
    mocks.getAuthenticatedUser.mockResolvedValueOnce({ user: null, supabase: null });

    const response = await getBusyWeek(BATCH);

    expect(response.status).toBe(401);
  });

  it("returns 404 for a batch that belongs to someone else", async () => {
    db.tables.generation_batches.push({
      id: BATCH,
      user_id: OTHER_USER_ID,
      week_start: WEEK,
      status: "completed",
      requested: 1,
      succeeded: 1,
      refunded: 0,
      results: [],
      created_at: new Date().toISOString(),
    });

    const response = await getBusyWeek(BATCH);

    expect(response.status).toBe(404);
  });

  it("returns 404 for a batch whose first request never reached the server", async () => {
    const response = await getBusyWeek(BATCH);

    expect(response.status).toBe(404);
  });

  it("returns the stored result for the signed-in user's batch", async () => {
    db.tables.recipes.push({
      id: "recipe-a",
      user_id: USER.id,
      title: "Saved Dish",
      cuisine: "Thai",
      meal_type: "Dinner",
      protein: "Chicken",
      prep_time: "10 minutes",
      cook_time: "20 minutes",
      ingredients: [],
      instructions: ["Cook."],
      servings: 2,
    });
    db.tables.weekly_plan.push({
      id: "slot-a",
      user_id: USER.id,
      recipe_id: "recipe-a",
      week_start: WEEK,
      day_of_week: 0,
      meal_slot: "dinner",
      servings_override: 2,
      cooked_at: null,
    });
    db.tables.generation_batches.push({
      id: BATCH,
      user_id: USER.id,
      week_start: WEEK,
      status: "completed",
      requested: 1,
      succeeded: 1,
      refunded: 0,
      usage_window_start: WINDOW,
      results: [{ index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId: "recipe-a", planSlotId: "slot-a" }],
      created_at: new Date().toISOString(),
    });

    const response = await getBusyWeek(BATCH);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ batchId: BATCH, status: "completed", usage: { reserved: 1, refunded: 0, remaining: 97 } });
    expect(json.results[0]).toMatchObject({
      index: 0,
      status: "placed",
      recipe: { id: "recipe-a", title: "Saved Dish" },
      planSlot: { id: "slot-a", dayOfWeek: 0 },
    });
  });

  it("shows a live batch as running, with unfinished picks still pending, and leaves it alone", async () => {
    db.tables.generation_batches.push({
      id: SECOND_BATCH,
      user_id: USER.id,
      week_start: WEEK,
      status: "running",
      requested: 2,
      succeeded: 0,
      refunded: 0,
      usage_window_start: WINDOW,
      results: [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "pending", recipeId: null, planSlotId: null },
        { index: 1, cuisine: "Italian", mealStyle: "Pasta", dayOfWeek: 2, status: "pending", recipeId: null, planSlotId: null },
      ],
      created_at: new Date().toISOString(),
    });

    const response = await getBusyWeek(SECOND_BATCH);
    const json = await response.json();

    expect(json.status).toBe("running");
    expect(json.results.map((r: { status: string }) => r.status)).toEqual(["pending", "pending"]);
    expect(mocks.refunds).toHaveLength(0);
  });

  it("finishes a batch that was left running after its function died, and refunds the unfinished picks", async () => {
    db.tables.generation_batches.push({
      id: SECOND_BATCH,
      user_id: USER.id,
      week_start: WEEK,
      status: "running",
      requested: 3,
      succeeded: 1,
      refunded: 0,
      usage_window_start: WINDOW,
      results: [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId: null, planSlotId: null },
        { index: 1, cuisine: "Italian", mealStyle: "Any", dayOfWeek: 2, status: "pending" },
        { index: 2, cuisine: "Mexican", mealStyle: "Taco", dayOfWeek: 4, status: "pending" },
      ],
      created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });

    const response = await getBusyWeek(SECOND_BATCH);
    const json = await response.json();

    expect(json.status).toBe("partial");
    expect(mocks.refunds).toEqual([{ userId: USER.id, count: 2, windowStart: WINDOW }]);
    expect(json.results.filter((r: { error?: string }) => r.error === "interrupted")).toHaveLength(2);
  });
});
