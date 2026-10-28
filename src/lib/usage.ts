import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export type UsageAction = "generate" | "refine";

export type UsageCheckResult = {
  allowed: boolean;
  planKey: string;
  weekCount?: number;
  weekLimitHard?: number | null;
  weekLimitSoft?: number | null;
  resetAt?: string;
  softLimited?: boolean;
  reason?: string;
  error?: string;
};

export type UsageStatus = {
  planKey: string;
  weekStart: string;
  resetAt: string;
  generate: {
    count: number;
    remaining: number | null;
    hardLimit: number | null;
    softLimit: number | null;
    tokens: number;
  };
  refine: {
    count: number;
    remaining: number | null;
    hardLimit: number | null;
    softLimit: number | null;
    tokens: number;
  };
  weeklyTokens: {
    softLimit: number | null;
    hardLimit: number | null;
    totalTokens: number;
  };
  softLimited: boolean;
};

/**
 * Check and increment usage for a given action (generate or refine).
 * This is atomic and called before making the AI request.
 */
export async function checkAndIncrementUsage(
  action: UsageAction,
  authenticatedUser: User
): Promise<UsageCheckResult> {
  if (!authenticatedUser) {
    return {
      allowed: false,
      planKey: "free",
      reason: "not_authenticated",
      error: "User not authenticated",
    };
  }

  // Admin bypass - unlimited usage for admin users
  if (
    process.env.ADMIN_USER_ID &&
    authenticatedUser.id === process.env.ADMIN_USER_ID
  ) {
    return {
      allowed: true,
      planKey: "admin",
      weekCount: 0,
      weekLimitHard: null,
      weekLimitSoft: null,
      softLimited: false,
    };
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await admin.rpc("check_and_increment_usage", {
      p_user_id: authenticatedUser.id,
      p_action: action,
      p_request_meta: {},
    });

    if (error) {
      console.error("Usage check failed:", error);
      return {
        allowed: false,
        planKey: "free",
        reason: "rpc_error",
        error: error.message,
      };
    }

    const result = data as {
      allowed: boolean;
      plan_key: string;
      action: string;
      week_count?: number;
      week_limit_hard?: number | null;
      week_limit_soft?: number | null;
      reset_at?: string;
      soft_limited?: boolean;
      reason?: string;
    };

    return {
      allowed: result.allowed,
      planKey: result.plan_key,
      weekCount: result.week_count,
      weekLimitHard: result.week_limit_hard,
      weekLimitSoft: result.week_limit_soft,
      resetAt: result.reset_at,
      softLimited: result.soft_limited ?? false,
      reason: result.reason,
    };
  } catch (err) {
    console.error("Usage check exception:", err);
    return {
      allowed: false,
      planKey: "free",
      reason: "exception",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Record token usage after an AI request completes.
 * This should be called even if the request fails (to prevent gaming).
 */
export async function recordUsageTokens(
  action: UsageAction,
  authenticatedUser: User,
  tokens: number | null | undefined
): Promise<void> {
  if (!authenticatedUser || !tokens || tokens <= 0) {
    return;
  }

  const admin = createAdminClient();

  try {
    await admin.rpc("record_usage_tokens", {
      p_user_id: authenticatedUser.id,
      p_action: action,
      p_tokens: tokens,
    });
  } catch (err) {
    // Log but don't fail the request if token recording fails
    console.error("Token recording failed:", err);
  }
}

/** The admin bypass is never counted, so admin batches skip the reservation. */
function isAdminBypass(authenticatedUser: User): boolean {
  return Boolean(process.env.ADMIN_USER_ID) && authenticatedUser.id === process.env.ADMIN_USER_ID;
}

export type BeginBusyWeekResult =
  | {
      outcome: "started";
      planKey: string;
      /** Start of the week bucket that was charged. Null for the admin bypass. */
      windowStart: string | null;
      /** Generations left this week after this batch. Null when unlimited. */
      remaining: number | null;
    }
  | { outcome: "duplicate" }
  | { outcome: "blocked"; reason: string; planKey: string; remaining: number | null }
  | { outcome: "error"; error: string };

/**
 * Record a busy-week batch and reserve its `count` generations in one database
 * transaction (begin_busy_week_batch). A batch id that already exists is reported
 * as a duplicate and reserves nothing.
 */
export async function beginBusyWeekBatch({
  batchId,
  user,
  weekStart,
  count,
  results,
}: {
  batchId: string;
  user: User;
  weekStart: string;
  count: number;
  results: unknown[];
}): Promise<BeginBusyWeekResult> {
  const admin = createAdminClient();

  try {
    const { data, error } = await admin.rpc("begin_busy_week_batch", {
      p_batch_id: batchId,
      p_user_id: user.id,
      p_week_start: weekStart,
      p_count: count,
      p_results: results,
      p_charge: !isAdminBypass(user),
    });

    if (error) {
      console.error("Busy week batch start failed:", error);
      return { outcome: "error", error: error.message };
    }

    const result = data as {
      outcome: "started" | "duplicate" | "blocked" | "invalid_count";
      plan_key?: string;
      reason?: string;
      window_start?: string | null;
      remaining?: number | null;
    };

    if (result.outcome === "started") {
      return {
        outcome: "started",
        planKey: result.plan_key ?? "free",
        windowStart: result.window_start ?? null,
        remaining: result.remaining ?? null,
      };
    }
    if (result.outcome === "blocked") {
      return {
        outcome: "blocked",
        reason: result.reason ?? "rpc_error",
        planKey: result.plan_key ?? "free",
        remaining: result.remaining ?? null,
      };
    }
    if (result.outcome === "duplicate") return { outcome: "duplicate" };
    return { outcome: "error", error: `Busy week batch start returned ${result.outcome}` };
  } catch (err) {
    console.error("Busy week batch start exception:", err);
    return { outcome: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export type SettleBusyWeekResult =
  | {
      ok: true;
      settled: boolean;
      status?: string;
      refunded?: number;
      reason?: string;
    }
  | { ok: false; error: string };

/**
 * Finish a busy-week batch and refund its failed picks, in one transaction
 * (settle_busy_week_batch). Safe to call again: a finished batch is left as it is,
 * and a refund is never counted twice. `interruptPending` is only for batches whose
 * function died (stale), so their unfinished picks are failed instead of waited on.
 */
export async function settleBusyWeekBatch(
  batchId: string,
  interruptPending: boolean
): Promise<SettleBusyWeekResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("settle_busy_week_batch", {
    p_batch_id: batchId,
    p_interrupt_pending: interruptPending,
  });

  if (error) {
    console.error("Busy week settle failed:", error);
    return { ok: false, error: error.message };
  }

  const result = data as { settled: boolean; status?: string; refunded?: number; reason?: string };
  return {
    ok: true,
    settled: result.settled,
    status: result.status,
    refunded: result.refunded,
    reason: result.reason,
  };
}

/**
 * Get current usage status without incrementing.
 * Used by the rate-limit status endpoint.
 */
export async function getUsageStatus(
  authenticatedUser: User
): Promise<UsageStatus | null> {
  if (!authenticatedUser) {
    return null;
  }

  // Admin bypass - unlimited usage for admin users
  if (
    process.env.ADMIN_USER_ID &&
    authenticatedUser.id === process.env.ADMIN_USER_ID
  ) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const resetAt = new Date(weekStart);
    resetAt.setDate(resetAt.getDate() + 7);

    return {
      planKey: "admin",
      weekStart: weekStart.toISOString(),
      resetAt: resetAt.toISOString(),
      generate: {
        count: 0,
        remaining: null,
        hardLimit: null,
        softLimit: null,
        tokens: 0,
      },
      refine: {
        count: 0,
        remaining: null,
        hardLimit: null,
        softLimit: null,
        tokens: 0,
      },
      weeklyTokens: {
        softLimit: null,
        hardLimit: null,
        totalTokens: 0,
      },
      softLimited: false,
    };
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await admin.rpc("get_usage_status", {
      p_user_id: authenticatedUser.id,
    });

    if (error || !data) {
      console.error("Usage status fetch failed:", error);
      return null;
    }

    const result = data as {
      plan_key: string;
      week_start: string;
      reset_at: string;
      generate: {
        count: number;
        remaining: number | null;
        hard_limit: number | null;
        soft_limit: number | null;
        tokens: number;
      };
      refine: {
        count: number;
        remaining: number | null;
        hard_limit: number | null;
        soft_limit: number | null;
        tokens: number;
      };
      weekly_tokens: {
        soft_limit: number | null;
        hard_limit: number | null;
        total_tokens: number;
      };
      soft_limited: boolean;
    };

    return {
      planKey: result.plan_key,
      weekStart: result.week_start,
      resetAt: result.reset_at,
      generate: {
        count: result.generate.count,
        remaining: result.generate.remaining,
        hardLimit: result.generate.hard_limit,
        softLimit: result.generate.soft_limit,
        tokens: result.generate.tokens,
      },
      refine: {
        count: result.refine.count,
        remaining: result.refine.remaining,
        hardLimit: result.refine.hard_limit,
        softLimit: result.refine.soft_limit,
        tokens: result.refine.tokens,
      },
      weeklyTokens: {
        softLimit: result.weekly_tokens.soft_limit,
        hardLimit: result.weekly_tokens.hard_limit,
        totalTokens: result.weekly_tokens.total_tokens,
      },
      softLimited: result.soft_limited,
    };
  } catch (err) {
    console.error("Usage status exception:", err);
    return null;
  }
}

/**
 * Get user-friendly error message for a usage block reason.
 */
export function getUsageErrorMessage(
  reason: string | undefined,
  planKey: string,
  remaining?: number | null
): string {
  switch (reason) {
    case "paid_plan_required":
      return "Busy week is a Plus or Pro feature. Upgrade to plan a whole week at once.";
    case "insufficient_remaining":
      return `This batch needs more recipes than you have left this week (${remaining ?? 0} left). Pick fewer dinners or try again next week.`;
    case "save_limit":
      return "Your saved recipes are full. Remove a few from your collection, then try again.";
    case "mise_blocked:weekly":
      if (planKey === "pro") {
        return "You've reached your weekly fair-use limit. Please contact support if you need higher limits.";
      }
      return "You've reached your weekly recipe limit! 🧑‍🍳 Our chefs are taking a break. Please come back next week for more delicious ideas.";
    case "mise_blocked:per_minute":
      return "Too many requests per minute. Please slow down and try again in a moment.";
    case "mise_blocked:per_hour":
      return "Too many requests per hour. Please slow down and try again later.";
    case "weekly_token_hard_limit":
      return "You've reached your weekly token limit. Please try again next week or upgrade your plan.";
    default:
      return "Usage limit reached. Please try again later.";
  }
}
