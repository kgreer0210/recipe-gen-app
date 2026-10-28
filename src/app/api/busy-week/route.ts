import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { validateBusyWeekRequest } from "@/lib/busyWeek";
import { runBusyWeek } from "@/lib/busyWeekBatch";

// Route segment config (Next 16 maxDuration). With fluid compute, 300s is allowed on every
// Vercel plan. The batch deadline (BUSY_WEEK_DEADLINE_MS, 240s) answers before this limit,
// and the stale-batch window (6 min) is longer than this limit, so a live batch is never reconciled.
export const maxDuration = 300;

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }

    const validation = validateBusyWeekRequest(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const outcome = await runBusyWeek({ user, supabase, request: validation.value });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Error planning busy week:", error);
    return NextResponse.json({ error: "Failed to plan Chef's Week" }, { status: 500 });
  }
}
