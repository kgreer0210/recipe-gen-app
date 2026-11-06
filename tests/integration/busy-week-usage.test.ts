import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Runs against a non-production Supabase target, with migrations through
// 20261102120000_family_plan_safety_caps applied. Every account is on the family plan
// (150 recipes a week, 10 a minute), whatever its subscriptions row says.
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
  `mise-busy-caps-${runId}@example.com`,
];

let admin: SupabaseClient;
const userIds: string[] = [];
let plusId = "";
let proId = "";
let freeId = "";
let burstId = "";
let capsId = "";
let proClient: SupabaseClient;
let otherClient: SupabaseClient;

type Reserve = {
  allowed: boolean;
  reason?: string;
  remaining?: number | null;
  window_start?: string | null;
};

/** The family plan allows 10 generations a minute; these tests check the weekly limit, so they clear the burst buckets. */
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
    [plusId, proId, freeId, burstId, capsId] = userIds;

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

  it("gives every account the family plan, whatever its subscription says", async () => {
    for (const id of [plusId, proId, freeId]) {
      const { data, error } = await admin.rpc("resolve_user_plan_key", { p_user_id: id });
      if (error) throw error;
      expect(data).toBe("family");
    }
  });

  it("stores the family safety caps", async () => {
    const { data, error } = await admin
      .from("plan_entitlements")
      .select("*")
      .eq("plan_key", "family")
      .single();
    if (error) throw error;
    expect(data).toMatchObject({
      weekly_generate_limit: 150,
      weekly_generate_soft_limit: null,
      weekly_generate_hard_limit: 150,
      weekly_refine_limit: 300,
      weekly_refine_soft_limit: null,
      weekly_refine_hard_limit: 300,
      save_limit: null,
      per_minute_generate_limit: 10,
      per_hour_generate_limit: 60,
      per_minute_refine_limit: 10,
      per_hour_refine_limit: 60,
      weekly_token_soft_limit: 500000,
      weekly_token_hard_limit: 1000000,
    });
  });

  it("lets an account with no subscription plan a week, and reports the family limits", async () => {
    const result = await reserve(freeId, 3);
    expect(result).toMatchObject({ allowed: true, plan_key: "family", remaining: 147 });
    expect(await weekCount(freeId)).toBe(3);

    const { data, error } = await admin.rpc("get_usage_status", { p_user_id: freeId });
    if (error) throw error;
    expect(data).toMatchObject({
      plan_key: "family",
      generate: { count: 3, remaining: 147, hard_limit: 150 },
      refine: { hard_limit: 300 },
      weekly_tokens: { soft_limit: 500000, hard_limit: 1000000 },
    });
  });

  it("does not cap saved recipes", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({
      user_id: freeId,
      title: `Family cap ${runId} ${index}`,
    }));
    try {
      const { error } = await admin.from("recipes").insert(rows);
      expect(error).toBeNull();
    } finally {
      await admin.from("recipes").delete().eq("user_id", freeId);
    }
  });

  it("does not partially reserve when the batch does not fit", async () => {
    // Family allows 150 a week. Seed 148 used (a batch is at most 7), then ask for 3 more: rejected, still 148.
    expect(await reserve(plusId, 1)).toMatchObject({ allowed: true });
    const { error: seedError } = await admin
      .from("user_usage_counters")
      .update({ count: 148 })
      .eq("user_id", plusId)
      .eq("scope", "week_generate");
    if (seedError) throw seedError;
    await clearBurstCounters(plusId);
    expect(await reserve(plusId, 3)).toMatchObject({
      allowed: false,
      reason: "insufficient_remaining",
      remaining: 2,
    });
    expect(await weekCount(plusId)).toBe(148);
  });

  it("reserves exactly what is left", async () => {
    await clearBurstCounters(plusId);
    expect(await reserve(plusId, 2)).toMatchObject({ allowed: true, remaining: 0 });
    expect(await weekCount(plusId)).toBe(150);
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
    expect(await weekCount(plusId)).toBe(148);

    await admin.rpc("release_usage", {
      p_user_id: plusId,
      p_action: "generate",
      p_count: 500,
      p_window_start: windowStart,
    });
    expect(await weekCount(plusId)).toBe(0);
  });

  it("lets only one of several concurrent reserves through near the limit", async () => {
    // Family has a 150 weekly hard limit. Seed it at 149, then race four 1-dinner reserves.
    const seed = await reserve(proId, 1);
    expect(seed).toMatchObject({ allowed: true });
    const { error: seedError } = await admin
      .from("user_usage_counters")
      .update({ count: 149 })
      .eq("user_id", proId)
      .eq("scope", "week_generate");
    if (seedError) throw seedError;

    const results = await Promise.all([1, 2, 3, 4].map(() => reserve(proId, 1)));
    const allowed = results.filter((result) => result.allowed);

    expect(allowed).toHaveLength(1);
    expect(await weekCount(proId)).toBe(150);
  });

  it("counts a whole batch as one burst request", async () => {
    // The per-minute limit is 10. A 7-dinner batch must not use up 7 minute slots.
    const result = await reserve(burstId, 7);
    expect(result).toMatchObject({ allowed: true, remaining: 143 });

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

  it("stops refinements at the weekly cap of 300", async () => {
    const check = async () => {
      const { data, error } = await admin.rpc("check_and_increment_usage", {
        p_user_id: capsId,
        p_action: "refine",
        p_request_meta: {},
      });
      if (error) throw error;
      return data as { allowed: boolean; reason?: string; week_count?: number; plan_key?: string };
    };

    expect(await check()).toMatchObject({ allowed: true, plan_key: "family", week_count: 1 });
    const { error: seedError } = await admin
      .from("user_usage_counters")
      .update({ count: 299 })
      .eq("user_id", capsId)
      .eq("scope", "week_refine");
    if (seedError) throw seedError;

    expect(await check()).toMatchObject({ allowed: true, week_count: 300 });
    expect(await check()).toMatchObject({ allowed: false, reason: "mise_blocked:weekly" });
  });

  it("warns at 500,000 weekly tokens and stops at 1,000,000", async () => {
    const check = async () => {
      const { data, error } = await admin.rpc("check_and_increment_usage", {
        p_user_id: capsId,
        p_action: "generate",
        p_request_meta: {},
      });
      if (error) throw error;
      return data as { allowed: boolean; reason?: string; soft_limited?: boolean };
    };
    const addTokens = async (tokens: number) => {
      const { error } = await admin.rpc("record_usage_tokens", {
        p_user_id: capsId,
        p_action: "generate",
        p_tokens: tokens,
      });
      if (error) throw error;
    };

    expect(await check()).toMatchObject({ allowed: true, soft_limited: false });
    await addTokens(500000);
    expect(await check()).toMatchObject({ allowed: true, soft_limited: true });
    await addTokens(500000);
    expect(await check()).toMatchObject({ allowed: false, reason: "weekly_token_hard_limit" });
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
