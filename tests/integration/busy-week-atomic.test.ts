import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Runs against a non-production Supabase target (the busy-week preview branch), and needs
// migration 20261028180000_busy_week_atomic applied there. Skips cleanly without the env.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(supabaseUrl && anonKey && serviceRoleKey);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Mise-Atomic-${runId}!`;
const emails = [`mise-atomic-plus-${runId}@example.com`, `mise-atomic-other-${runId}@example.com`];
const WEEK = "2026-10-26";
const NEXT_WEEK = "2026-11-02";

let admin: SupabaseClient;
let plusClient: SupabaseClient;
let otherClient: SupabaseClient;
let plusId = "";
let otherId = "";
const userIds: string[] = [];

function newClient(): SupabaseClient {
  return createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function setPlan(userId: string, planKey: "plus" | "free") {
  if (planKey === "free") {
    await admin.from("subscriptions").delete().eq("user_id", userId);
    return;
  }
  const { error } = await admin.from("subscriptions").upsert(
    { user_id: userId, status: "active", plan_key: planKey, price_id: "price_test_placeholder" },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

async function weekCount(userId: string): Promise<number> {
  const { data, error } = await admin
    .from("user_usage_counters")
    .select("count")
    .eq("user_id", userId)
    .eq("scope", "week_generate");
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + (row.count as number), 0);
}

async function makeRecipe(userId: string, title: string): Promise<string> {
  const { data, error } = await admin
    .from("recipes")
    .insert({
      user_id: userId,
      title,
      cuisine: "Thai",
      meal_type: "Dinner",
      prep_time: "10 minutes",
      cook_time: "20 minutes",
      protein: "Chicken",
      ingredients: [],
      instructions: ["Cook."],
      servings: 2,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

type Pick = Record<string, unknown>;

function pendingPick(index: number, dayOfWeek: number): Pick {
  return { index, cuisine: "Thai", mealStyle: "Any", dayOfWeek, status: "pending", recipeId: null, planSlotId: null };
}

async function begin(batchId: string, userId: string, count: number, results: Pick[], charge = true) {
  const { data, error } = await admin.rpc("begin_busy_week_batch", {
    p_batch_id: batchId,
    p_user_id: userId,
    p_week_start: WEEK,
    p_count: count,
    p_results: results,
    p_charge: charge,
  });
  if (error) throw error;
  return data as { outcome: string; reason?: string; window_start?: string | null; remaining?: number | null };
}

async function settle(batchId: string, interruptPending: boolean) {
  const { data, error } = await admin.rpc("settle_busy_week_batch", {
    p_batch_id: batchId,
    p_interrupt_pending: interruptPending,
  });
  if (error) throw error;
  return data as { settled: boolean; reason?: string; status?: string; refunded?: number; refunded_now?: number };
}

async function batchRow(batchId: string) {
  const { data, error } = await admin.from("generation_batches").select("*").eq("id", batchId).single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

async function place(client: SupabaseClient, args: { day: number | null; recipeId: string; replaceSlotId?: string | null; weekStart?: string }) {
  const { data, error } = await client.rpc("place_busy_week_dinner", {
    p_week_start: args.weekStart ?? NEXT_WEEK,
    p_day_of_week: args.day,
    p_recipe_id: args.recipeId,
    p_replace_slot_id: args.replaceSlotId ?? null,
    p_servings: 2,
  });
  return { data: data as { status: string; slot: Record<string, unknown> } | null, error };
}

async function planFor(userId: string, weekStart: string) {
  const { data, error } = await admin
    .from("weekly_plan")
    .select("id, recipe_id, day_of_week, meal_slot")
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
  return data ?? [];
}

describe.skipIf(!hasEnv)("busy week atomic database functions", () => {
  beforeAll(async () => {
    admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const email of emails) {
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw created.error ?? new Error(`Could not create ${email}`);
      userIds.push(created.data.user.id);
    }
    [plusId, otherId] = userIds;
    await setPlan(plusId, "plus");
    await setPlan(otherId, "plus");

    plusClient = newClient();
    const plusSignIn = await plusClient.auth.signInWithPassword({ email: emails[0], password });
    if (plusSignIn.error) throw plusSignIn.error;
    otherClient = newClient();
    const otherSignIn = await otherClient.auth.signInWithPassword({ email: emails[1], password });
    if (otherSignIn.error) throw otherSignIn.error;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("generation_batches").delete().in("user_id", userIds);
    await admin.from("weekly_plan").delete().in("user_id", userIds);
    await admin.from("recipes").delete().in("user_id", userIds);
    await admin.from("user_usage_counters").delete().in("user_id", userIds);
    await admin.from("subscriptions").delete().in("user_id", userIds);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  describe("begin_busy_week_batch", () => {
    it("records the batch and reserves its dinners in one call, storing the week it charged", async () => {
      const batchId = crypto.randomUUID();

      const result = await begin(batchId, plusId, 3, [pendingPick(0, 0), pendingPick(1, 2), pendingPick(2, 4)]);

      expect(result).toMatchObject({ outcome: "started", remaining: expect.any(Number) });
      expect(await weekCount(plusId)).toBe(3);
      expect((await batchRow(batchId)).usage_window_start).not.toBeNull();
    });

    it("answers a repeated batch id as a duplicate and reserves nothing again", async () => {
      const batchId = crypto.randomUUID();
      await begin(batchId, plusId, 2, [pendingPick(0, 0), pendingPick(1, 1)]);
      const before = await weekCount(plusId);

      const again = await begin(batchId, plusId, 2, [pendingPick(0, 0), pendingPick(1, 1)]);

      expect(again).toEqual({ outcome: "duplicate" });
      expect(await weekCount(plusId)).toBe(before);
    });

    it("blocks a free user, leaves a failed batch row, and counts nothing", async () => {
      const otherBatch = crypto.randomUUID();
      await setPlan(otherId, "free");
      try {
        const result = await begin(otherBatch, otherId, 2, [pendingPick(0, 0), pendingPick(1, 1)]);

        expect(result).toMatchObject({ outcome: "blocked", reason: "paid_plan_required" });
        expect(await weekCount(otherId)).toBe(0);
        expect((await batchRow(otherBatch)).status).toBe("failed");
      } finally {
        await setPlan(otherId, "plus");
      }
    });

    it("records an admin batch without charging the weekly count", async () => {
      const batchId = crypto.randomUUID();
      const before = await weekCount(otherId);

      const result = await begin(batchId, otherId, 2, [pendingPick(0, 0), pendingPick(1, 1)], false);

      expect(result).toMatchObject({ outcome: "started", window_start: null });
      expect(await weekCount(otherId)).toBe(before);
      expect((await batchRow(batchId)).status).toBe("running");
    });
  });

  describe("settle_busy_week_batch", () => {
    it("refunds each failed pick once, and a second call changes nothing", async () => {
      const batchId = crypto.randomUUID();
      const recipeId = await makeRecipe(plusId, `Settle once ${runId}`);
      const before = await weekCount(plusId);
      await begin(batchId, plusId, 3, [pendingPick(0, 0), pendingPick(1, 2), pendingPick(2, 4)]);
      await admin
        .from("generation_batches")
        .update({
          results: [
            { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "placed", recipeId, planSlotId: null },
            { index: 1, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 2, status: "failed", recipeId: null, planSlotId: null, error: "generation_failed" },
            { index: 2, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 4, status: "failed", recipeId: null, planSlotId: null, error: "save_failed" },
          ],
        })
        .eq("id", batchId);

      const first = await settle(batchId, false);
      const second = await settle(batchId, false);
      const third = await settle(batchId, true);

      expect(first).toMatchObject({ settled: true, status: "partial", refunded: 2, refunded_now: 2 });
      expect(second).toMatchObject({ settled: false, reason: "already_settled", status: "partial" });
      expect(third).toMatchObject({ settled: false, reason: "already_settled" });
      expect(await weekCount(plusId)).toBe(before + 1);
      expect(await batchRow(batchId)).toMatchObject({ status: "partial", refunded: 2, succeeded: 1 });
    });

    it("refunds a failed pick that was recorded before a crash and never settled (window A)", async () => {
      const batchId = crypto.randomUUID();
      await begin(batchId, plusId, 2, [pendingPick(0, 0), pendingPick(1, 2)]);
      const before = await weekCount(plusId);
      // The function recorded pick 1 as failed, then died before settling.
      await admin
        .from("generation_batches")
        .update({
          results: [
            { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "pending", recipeId: null, planSlotId: null },
            { index: 1, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 2, status: "failed", recipeId: null, planSlotId: null, error: "generation_failed" },
          ],
        })
        .eq("id", batchId);

      const pendingFirst = await settle(batchId, false);
      const settled = await settle(batchId, true);

      expect(pendingFirst).toMatchObject({ settled: false, reason: "pending_picks" });
      expect(settled).toMatchObject({ settled: true, status: "failed", refunded: 2 });
      expect(await weekCount(plusId)).toBe(before - 2);
    });

    it("interrupts a pick that never finished (refunded) and keeps a pick that saved its recipe (not refunded)", async () => {
      const batchId = crypto.randomUUID();
      const recipeId = await makeRecipe(plusId, `Saved before crash ${runId}`);
      await begin(batchId, plusId, 2, [pendingPick(0, 0), pendingPick(1, 2)]);
      const before = await weekCount(plusId);
      await admin
        .from("generation_batches")
        .update({
          results: [
            { index: 0, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 0, status: "pending", recipeId: null, planSlotId: null },
            { index: 1, cuisine: "Thai", mealStyle: "Any", dayOfWeek: 2, status: "pending", recipeId, planSlotId: null },
          ],
        })
        .eq("id", batchId);

      const settled = await settle(batchId, true);
      const row = await batchRow(batchId);

      expect(settled).toMatchObject({ settled: true, refunded: 1 });
      expect(await weekCount(plusId)).toBe(before - 1);
      expect((row.results as Array<{ status: string; error?: string }>).map((pick) => [pick.status, pick.error])).toEqual([
        ["failed", "interrupted"],
        ["unscheduled", "plan_insert_failed"],
      ]);
    });

    it("reports a missing batch without changing anything", async () => {
      expect(await settle(crypto.randomUUID(), true)).toMatchObject({ settled: false, reason: "not_found" });
    });

    it("does not let an authenticated user call it directly", async () => {
      const { error } = await plusClient.rpc("settle_busy_week_batch", {
        p_batch_id: crypto.randomUUID(),
        p_interrupt_pending: true,
      });
      expect(error).not.toBeNull();
    });
  });

  describe("place_busy_week_dinner", () => {
    it("places a dinner on an empty day for the signed-in user", async () => {
      const recipeId = await makeRecipe(plusId, `Empty day ${runId}`);

      const { data, error } = await place(plusClient, { day: 1, recipeId });

      expect(error).toBeNull();
      expect(data).toMatchObject({ status: "placed", slot: { day_of_week: 1, meal_slot: "dinner", user_id: plusId } });
    });

    it("replaces exactly the dinner it was told to replace, and keeps the old recipe", async () => {
      const oldRecipe = await makeRecipe(plusId, `Old dinner ${runId}`);
      const newRecipe = await makeRecipe(plusId, `New dinner ${runId}`);
      const oldSlot = await place(plusClient, { day: 3, recipeId: oldRecipe });
      const oldSlotId = oldSlot.data!.slot.id as string;

      const result = await place(plusClient, { day: 3, recipeId: newRecipe, replaceSlotId: oldSlotId });

      expect(result.data).toMatchObject({ status: "replaced" });
      const day3 = (await planFor(plusId, NEXT_WEEK)).filter((row) => row.day_of_week === 3);
      expect(day3).toHaveLength(1);
      expect(day3[0].recipe_id).toBe(newRecipe);
      const { data: kept } = await admin.from("recipes").select("id").eq("id", oldRecipe);
      expect(kept).toHaveLength(1);
    });

    it("sends the dinner to the tray and leaves the day alone when the replace id is no longer the day's dinner", async () => {
      const first = await makeRecipe(plusId, `First ${runId}`);
      const second = await makeRecipe(plusId, `Second ${runId}`);
      const incoming = await makeRecipe(plusId, `Incoming ${runId}`);
      const firstSlot = (await place(plusClient, { day: 5, recipeId: first })).data!.slot.id as string;
      // Another tab swaps the day's dinner after the user confirmed the first one.
      await admin.from("weekly_plan").delete().eq("id", firstSlot);
      const otherSlot = (await place(plusClient, { day: 5, recipeId: second })).data!.slot.id as string;

      const result = await place(plusClient, { day: 5, recipeId: incoming, replaceSlotId: firstSlot });

      expect(result.data).toMatchObject({ status: "slot_taken", slot: { day_of_week: null, meal_slot: null } });
      const dated = (await planFor(plusId, NEXT_WEEK)).filter((row) => row.day_of_week === 5);
      expect(dated.map((row) => row.id)).toEqual([otherSlot]);
    });

    it("never overwrites a day that is filled by something else", async () => {
      const occupant = await makeRecipe(plusId, `Occupant ${runId}`);
      const incoming = await makeRecipe(plusId, `Would overwrite ${runId}`);
      await place(plusClient, { day: 6, recipeId: occupant });

      const result = await place(plusClient, { day: 6, recipeId: incoming });

      expect(result.data).toMatchObject({ status: "slot_taken" });
      const dated = (await planFor(plusId, NEXT_WEEK)).filter((row) => row.day_of_week === 6);
      expect(dated.map((row) => row.recipe_id)).toEqual([occupant]);
    });

    it("lets only one of two concurrent placements take an empty day", async () => {
      const recipeA = await makeRecipe(plusId, `Race A ${runId}`);
      const recipeB = await makeRecipe(plusId, `Race B ${runId}`);

      const results = await Promise.all([
        place(plusClient, { day: 2, recipeId: recipeA, weekStart: "2026-11-09" }),
        place(plusClient, { day: 2, recipeId: recipeB, weekStart: "2026-11-09" }),
      ]);

      const statuses = results.map((result) => result.data?.status).sort();
      expect(statuses).toEqual(["placed", "slot_taken"]);
      const dated = (await planFor(plusId, "2026-11-09")).filter((row) => row.day_of_week === 2);
      expect(dated).toHaveLength(1);
    });

    it("refuses another user's recipe", async () => {
      const theirs = await makeRecipe(otherId, `Not mine ${runId}`);

      const { error } = await place(plusClient, { day: 0, recipeId: theirs, weekStart: "2026-11-16" });

      expect(error).not.toBeNull();
      expect(await planFor(plusId, "2026-11-16")).toHaveLength(0);
    });

    it("refuses a call with no signed-in user", async () => {
      const anonymous = newClient();
      const recipeId = await makeRecipe(plusId, `Anonymous ${runId}`);

      const { error } = await place(anonymous, { day: 0, recipeId, weekStart: "2026-11-23" });

      expect(error).not.toBeNull();
    });
  });
});
