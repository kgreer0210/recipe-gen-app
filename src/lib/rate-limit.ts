import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export async function checkRateLimit(limit: number = 5, authenticatedUser?: User) {
  // Use provided user (from Bearer token auth) or return error
  const user = authenticatedUser;

  if (!user) {
    return { allowed: false, remaining: 0, error: "User not authenticated" };
  }

  // Check for active subscription
  const admin = createAdminClient();

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing"])
    .single();

  if (subscription) {
    return { allowed: true, remaining: 9999, error: undefined };
  }

  // Check if user is admin
  if (process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID) {
    console.log("Admin user detected, bypassing rate limit");
    return { allowed: true, remaining: 9999, error: undefined };
  } else if (process.env.ADMIN_USER_ID) {
    console.log(
      `Admin check failed. User: ${user.id}, Expected: ${process.env.ADMIN_USER_ID}`
    );
  }

  const { data, error } = await admin.rpc("check_and_increment_rate_limit", {
    user_id: user.id,
    limit_count: limit,
  });

  if (error) {
    console.error("Rate limit check failed:", error);
    return { allowed: false, remaining: 0, error: error.message };
  }

  return { allowed: data.allowed, remaining: data.remaining, error: undefined };
}
