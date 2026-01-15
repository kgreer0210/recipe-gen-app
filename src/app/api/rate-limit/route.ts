import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { getUsageStatus } from "@/lib/usage";

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (process.env.ADMIN_USER_ID && user.id === process.env.ADMIN_USER_ID) {
      return NextResponse.json({
        remaining: null,
        limit: null,
        isBlocked: false,
        planKey: "admin",
        generate: { remaining: null, limit: null, count: 0 },
        refine: { remaining: null, limit: null, count: 0 },
        resetAt: null,
      });
    }

    const status = await getUsageStatus(user);

    if (!status) {
      return NextResponse.json(
        { error: "Failed to fetch usage status" },
        { status: 500 }
      );
    }

    // For backward compatibility, return generate remaining as primary
    const remaining = status.generate.remaining;
    const limit = status.generate.hardLimit;
    const isBlocked = remaining !== null && remaining === 0;

    return NextResponse.json({
      remaining,
      limit,
      isBlocked,
      planKey: status.planKey,
      generate: {
        remaining: status.generate.remaining,
        limit: status.generate.hardLimit,
        count: status.generate.count,
        softLimited: status.softLimited && status.generate.count > (status.generate.softLimit ?? 0),
      },
      refine: {
        remaining: status.refine.remaining,
        limit: status.refine.hardLimit,
        count: status.refine.count,
        softLimited: status.softLimited && status.refine.count > (status.refine.softLimit ?? 0),
      },
      resetAt: status.resetAt,
      softLimited: status.softLimited,
    });
  } catch (error) {
    console.error("Error in rate-limit API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
