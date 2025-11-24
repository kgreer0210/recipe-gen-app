import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function checkRateLimit(limit: number = 5) {
  // We need the user ID from the session to pass to the admin RPC
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    return { allowed: true, remaining: 9999, error: undefined };
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
