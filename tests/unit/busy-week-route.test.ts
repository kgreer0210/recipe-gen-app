import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeDb } from "./support/fakeSupabase";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
  reserveUsage: vi.fn(),
  releaseUsage: vi.fn(),
  recordUsageTokens: vi.fn(),
  getUsageStatus: vi.fn(),
  chatJson: vi.fn(),
  adminClient: { current: null as unknown },
  failCuisines: { current: new Set<string>() },
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
    reserveUsage: mocks.reserveUsage,
    releaseUsage: mocks.releaseUsage,
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

let db: FakeDb;

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

describe("busy week route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db = { tables: { user_settings: [], recipes: [], weekly_plan: [], generation_batches: [] } };
    const client = createFakeSupabase(db);
    mocks.adminClient.current = client;
    mocks.getAuthenticatedUser.mockResolvedValue({ user: USER, supabase: client });
    mocks.reserveUsage.mockResolvedValue({
      allowed: true,
      planKey: "plus",
      remaining: 97,
      windowStart: WINDOW,
    });
    mocks.releaseUsage.mockResolvedValue(undefined);
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
    ])("returns 400 for %s without reserving or calling the model", async (_label, body) => {
      const response = await postBusyWeek(body);

      expect(response.status).toBe(400);
      expect(mocks.reserveUsage).not.toHaveBeenCalled();
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("returns 401 when nobody is signed in", async () => {
      mocks.getAuthenticatedUser.mockResolvedValueOnce({ user: null, supabase: null });

      const response = await postBusyWeek(busyBody());

      expect(response.status).toBe(401);
      expect(mocks.reserveUsage).not.toHaveBeenCalled();
    });
  });

  describe("paid plan and limits", () => {
    it("refuses a free user with 403 and makes no model calls", async () => {
      mocks.reserveUsage.mockResolvedValueOnce({
        allowed: false,
        planKey: "free",
        reason: "paid_plan_required",
        remaining: null,
        windowStart: null,
      });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.reason).toBe("paid_plan_required");
      expect(mocks.chatJson).not.toHaveBeenCalled();
      expect(mocks.releaseUsage).not.toHaveBeenCalled();
    });

    it("returns 429 with what is left when the batch does not fit, before any model call", async () => {
      mocks.reserveUsage.mockResolvedValueOnce({
        allowed: false,
        planKey: "plus",
        reason: "insufficient_remaining",
        remaining: 2,
        windowStart: null,
      });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.reason).toBe("insufficient_remaining");
      expect(json.remaining).toBe(2);
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("reserves all picks up front, as a single batch", async () => {
      await postBusyWeek(busyBody());

      expect(mocks.reserveUsage).toHaveBeenCalledTimes(1);
      expect(mocks.reserveUsage).toHaveBeenCalledWith("generate", USER, 3);
    });
  });

  describe("running a batch", () => {
    it("saves every dinner and places each one when all succeed", async () => {
      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.status).toBe("completed");
      expect(json.usage).toMatchObject({ reserved: 3, refunded: 0 });
      expect(json.results.map((r: { status: string }) => r.status)).toEqual([
        "placed",
        "placed",
        "placed",
      ]);
      expect(db.tables.recipes).toHaveLength(3);
      expect(planRows().map((row) => row.day_of_week).sort()).toEqual([0, 2, 4]);
      expect(mocks.releaseUsage).not.toHaveBeenCalled();
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
      expect(json.results.filter((r: { status: string }) => r.status === "failed")).toHaveLength(2);
      expect(
        json.results.filter((r: { status: string; error?: string }) => r.status === "failed")
          .map((r: { error: string }) => r.error)
      ).toEqual(["generation_failed", "generation_failed"]);
      expect(mocks.releaseUsage).toHaveBeenCalledTimes(1);
      expect(mocks.releaseUsage).toHaveBeenCalledWith("generate", USER, 2, WINDOW);
      expect(mocks.recordUsageTokens).toHaveBeenCalledTimes(5);
    });

    it("marks the batch failed and refunds everything when no dinner can be made", async () => {
      mocks.failCuisines.current = new Set(["Thai", "Italian", "Mexican"]);

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(json.status).toBe("failed");
      expect(json.usage.refunded).toBe(3);
      expect(mocks.releaseUsage).toHaveBeenCalledWith("generate", USER, 3, WINDOW);
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

      const response = await postBusyWeek(
        busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0, replaceSlotId: "old-slot" }] })
      );
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

      const response = await postBusyWeek(
        busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0, replaceSlotId: "old-slot" }] })
      );
      const json = await response.json();

      expect(json.results[0].status).toBe("replaced");
      expect(planRows().find((row) => row.id === "old-slot")).toBeUndefined();
      expect(planRows().filter((row) => row.day_of_week === 0)).toHaveLength(1);
      expect(db.tables.recipes.map((row) => row.id)).toContain("old-recipe");
    });

    it("does not overwrite a day that was filled by something else, and does not refund", async () => {
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
      expect(mocks.releaseUsage).not.toHaveBeenCalled();
    });

    it("refunds a pick whose recipe could not be saved", async () => {
      const originalFail = (table: string) =>
        table === "recipes" ? { code: "P0001", message: "mise_blocked:save_limit" } : null;
      db.failInsert = originalFail;

      const response = await postBusyWeek(busyBody({ picks: [{ cuisine: "Thai", dayOfWeek: 0 }] }));
      const json = await response.json();

      expect(json.results[0]).toMatchObject({ status: "failed", error: "save_failed" });
      expect(mocks.releaseUsage).toHaveBeenCalledWith("generate", USER, 1, WINDOW);
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

    it("returns 409 for a batch id that already exists, and does not reserve again", async () => {
      db.tables.generation_batches.push({
        id: BATCH,
        user_id: USER.id,
        week_start: WEEK,
        status: "running",
        requested: 3,
        succeeded: 0,
        results: [],
        usage_window_start: WINDOW,
        created_at: new Date().toISOString(),
      });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.batchId).toBe(BATCH);
      expect(mocks.reserveUsage).not.toHaveBeenCalled();
      expect(mocks.chatJson).not.toHaveBeenCalled();
    });

    it("answers a request with an admin bypass the same way as a paid user", async () => {
      mocks.reserveUsage.mockResolvedValueOnce({ allowed: true, planKey: "admin", remaining: null, windowStart: null });

      const response = await postBusyWeek(busyBody());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.usage.remaining).toBeNull();
      expect(mocks.releaseUsage).not.toHaveBeenCalled();
    });
  });
});

describe("GET /api/busy-week/[batchId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db = { tables: { user_settings: [], recipes: [], weekly_plan: [], generation_batches: [] } };
    const client = createFakeSupabase(db);
    mocks.adminClient.current = client;
    mocks.getAuthenticatedUser.mockResolvedValue({ user: USER, supabase: client });
    mocks.releaseUsage.mockResolvedValue(undefined);
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
      results: [],
      created_at: new Date().toISOString(),
    });

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
      usage_window_start: WINDOW,
      results: [
        { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId: "recipe-a", planSlotId: "slot-a" },
      ],
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

  it("finishes a batch that was left running after its function died, and refunds the unfinished picks", async () => {
    db.tables.generation_batches.push({
      id: SECOND_BATCH,
      user_id: USER.id,
      week_start: WEEK,
      status: "running",
      requested: 3,
      succeeded: 1,
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
    expect(mocks.releaseUsage).toHaveBeenCalledWith("generate", USER, 2, WINDOW);
    expect(json.results.filter((r: { error?: string }) => r.error === "interrupted")).toHaveLength(2);
  });
});
