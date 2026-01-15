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
  planKey: string
): string {
  switch (reason) {
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
