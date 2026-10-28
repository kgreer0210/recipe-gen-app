import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Runs against a non-production Supabase target (the busy-week preview branch).
// Skips cleanly when the env is missing, so local runs without secrets still pass.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(supabaseUrl && anonKey && serviceRoleKey);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = `Mise-Test-${runId}!`;
const emails = [
  `mise-busy-plus-${runId}@example.com`,
  `mise-busy-pro-${runId}@example.com`,
  `mise-busy-free-${runId}@example.com`,
  `mise-busy-burst-${runId}@example.com`,
];

let admin: SupabaseClient;
const userIds: string[] = [];
let plusId = "";
let proId = "";
let freeId = "";
let burstId = "";
let proClient: SupabaseClient;
let otherClient: SupabaseClient;

type Reserve = {
  allowed: boolean;
  reason?: string;
  remaining?: number | null;
  window_start?: string | null;
};

/** Plus allows 2 generations a minute; these tests check the weekly limit, so they clear the burst buckets. */
async function clearBurstCounters(userId: string) {
  const { error } = await admin
    .from("user_usage_counters")
    .delete()
    .eq("user_id", userId)
    .in("scope", ["minute_generate", "hour_generate"]);
  if (error) throw error;
}

async function reserve(userId: string, count: number): Promise<Reserve> {
  const { data, error } = await admin.rpc("reserve_usage", {
    p_user_id: userId,
    p_action: "generate",
    p_count: count,
  });
  if (error) throw error;
  return data as Reserve;
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

async function setPlan(userId: string, planKey: "plus" | "pro") {
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      status: "active",
      plan_key: planKey,
      price_id: "price_test_placeholder",
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

describe.skipIf(!hasEnv)("Busy week usage RPCs and generation_batches", () => {
  beforeAll(async () => {
    admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const email of emails) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw created.error ?? new Error(`Could not create ${email}`);
      }
      userIds.push(created.data.user.id);
    }
    [plusId, proId, freeId, burstId] = userIds;

    await setPlan(plusId, "plus");
    await setPlan(proId, "pro");
    await setPlan(burstId, "pro");

    proClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const proSignIn = await proClient.auth.signInWithPassword({ email: emails[1], password });
    if (proSignIn.error) throw proSignIn.error;

    otherClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const otherSignIn = await otherClient.auth.signInWithPassword({ email: emails[2], password });
    if (otherSignIn.error) throw otherSignIn.error;
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("generation_batches").delete().in("user_id", userIds);
    await admin.from("user_usage_counters").delete().in("user_id", userIds);
    await admin.from("subscriptions").delete().in("user_id", userIds);
    for (const id of userIds) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("refuses a free user with paid_plan_required and changes nothing", async () => {
    const result = await reserve(freeId, 3);

    expect(result).toMatchObject({ allowed: false, reason: "paid_plan_required" });
    expect(await weekCount(freeId)).toBe(0);
  });

  it("does not partially reserve when the batch does not fit", async () => {
    // Plus allows 100 a week. Seed 98 used (a batch is at most 7), then ask for 3 more: rejected, still 98.
    expect(await reserve(plusId, 1)).toMatchObject({ allowed: true });
    const { error: seedError } = await admin
      .from("user_usage_counters")
      .update({ count: 98 })
      .eq("user_id", plusId)
      .eq("scope", "week_generate");
    if (seedError) throw seedError;
    await clearBurstCounters(plusId);
    expect(await reserve(plusId, 3)).toMatchObject({
      allowed: false,
      reason: "insufficient_remaining",
      remaining: 2,
    });
    expect(await weekCount(plusId)).toBe(98);
  });

  it("reserves exactly what is left", async () => {
    await clearBurstCounters(plusId);
    expect(await reserve(plusId, 2)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await weekCount(plusId)).toBe(100);
  });

  it("releases back down and never below zero", async () => {
    await clearBurstCounters(plusId);
    // The week is full, so one more dinner is refused.
    expect(await reserve(plusId, 1)).toMatchObject({ allowed: false, reason: "insufficient_remaining" });

    const { data: windowRow } = await admin
      .from("user_usage_counters")
      .select("window_start")
      .eq("user_id", plusId)
      .eq("scope", "week_generate")
      .single();
    const windowStart = windowRow!.window_start as string;

    const { data: first } = await admin.rpc("release_usage", {
      p_user_id: plusId,
      p_action: "generate",
      p_count: 2,
      p_window_start: windowStart,
    });
    expect(first).toMatchObject({ released: 2 });
    expect(await weekCount(plusId)).toBe(98);

    await admin.rpc("release_usage", {
      p_user_id: plusId,
      p_action: "generate",
      p_count: 500,
      p_window_start: windowStart,
    });
    expect(await weekCount(plusId)).toBe(0);
  });

  it("lets only one of several concurrent reserves through near the limit", async () => {
    // Pro has a 1500 weekly hard limit. Seed it at 1499, then race four 1-dinner reserves.
    const seed = await reserve(proId, 1);
    expect(seed).toMatchObject({ allowed: true });
    const { error: seedError } = await admin
      .from("user_usage_counters")
      .update({ count: 1499 })
      .eq("user_id", proId)
      .eq("scope", "week_generate");
    if (seedError) throw seedError;

    const results = await Promise.all([1, 2, 3, 4].map(() => reserve(proId, 1)));
    const allowed = results.filter((result) => result.allowed);

    expect(allowed).toHaveLength(1);
    expect(await weekCount(proId)).toBe(1500);
  });

  it("counts a whole batch as one burst request", async () => {
    // Pro's per-minute limit is 5. A 7-dinner batch must not use up 7 minute slots.
    const result = await reserve(burstId, 7);
    expect(result).toMatchObject({ allowed: true, remaining: 1493 });

    const { data: minute } = await admin
      .from("user_usage_counters")
      .select("count")
      .eq("user_id", burstId)
      .eq("scope", "minute_generate");
    expect(minute?.[0]?.count).toBe(1);
  });

  it("returns the window the batch was charged to", async () => {
    const result = await reserve(burstId, 1);
    expect(result.window_start).toEqual(expect.any(String));
  });

  it("keeps one user's generation_batches invisible to another user", async () => {
    const batchId = crypto.randomUUID();
    const { error: insertError } = await admin.from("generation_batches").insert({
      id: batchId,
      user_id: proId,
      week_start: "2026-10-26",
      status: "completed",
      requested: 1,
      succeeded: 1,
      results: [],
    });
    if (insertError) throw insertError;

    const own = await proClient.from("generation_batches").select("id").eq("id", batchId);
    expect(own.data).toHaveLength(1);

    const other = await otherClient.from("generation_batches").select("id").eq("id", batchId);
    expect(other.data).toHaveLength(0);

    // Writes are server-only: a signed-in user cannot insert a batch row.
    const forged = await proClient.from("generation_batches").insert({
      id: crypto.randomUUID(),
      user_id: proId,
      week_start: "2026-10-26",
      status: "completed",
      requested: 1,
      succeeded: 1,
    });
    expect(forged.error).not.toBeNull();
  });

  it("does not let an authenticated user call the usage RPCs directly", async () => {
    const { error } = await proClient.rpc("reserve_usage", {
      p_user_id: proId,
      p_action: "generate",
      p_count: 1,
    });
    expect(error).not.toBeNull();
  });
});
