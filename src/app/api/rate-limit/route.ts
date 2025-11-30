import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID) {
      return NextResponse.json({
        remaining: 9999,
        limit: 9999,
        isBlocked: false,
      });
    } else if (process.env.ADMIN_USER_ID) {
      console.log(
        `[API] Admin check failed. User: ${user.id}, Expected: ${process.env.ADMIN_USER_ID}`
      );
    }

    const admin = createAdminClient();

    // Check for active subscription
    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .single();

    if (subscription) {
      return NextResponse.json({
        remaining: 9999,
        limit: 9999,
        isBlocked: false,
      });
    }

    const { data: rateLimit, error } = await admin
      .from("user_rate_limits")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found"
      console.error("Error fetching rate limit:", error);
      return NextResponse.json(
        { error: "Failed to fetch rate limit" },
        { status: 500 }
      );
    }

    const limit = 5; // Hardcoded for now, ideally shared constant
    let count = 0;

    if (rateLimit) {
      const lastReset = new Date(rateLimit.last_reset);
      const now = new Date();
      const oneDay = 24 * 60 * 60 * 1000;

      if (now.getTime() - lastReset.getTime() > oneDay) {
        count = 0;
      } else {
        count = rateLimit.count;
      }
    }

    const remaining = Math.max(0, limit - count);
    const isBlocked = remaining === 0;

    return NextResponse.json({
      remaining,
      limit,
      isBlocked,
    });
  } catch (error) {
    console.error("Error in rate-limit API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
