import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { validateBusyWeekRequest } from "@/lib/busyWeek";
import { runBusyWeek } from "@/lib/busyWeekBatch";

// Seven dinners with model calls can take a while. Route segment config (Next 16):
// Pro plans allow up to 300s. Longer than the stale-batch window, so live batches are never reconciled.
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
    return NextResponse.json({ error: "Failed to plan busy week" }, { status: 500 });
  }
}
