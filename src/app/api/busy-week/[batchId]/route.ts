import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { isUuid } from "@/lib/busyWeek";
import { readBusyWeek } from "@/lib/busyWeekBatch";

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { user, supabase } = await getAuthenticatedUser(request);

    if (!user || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { batchId } = await params;
    if (!isUuid(batchId)) {
      return NextResponse.json({ error: "batchId must be a UUID." }, { status: 400 });
    }

    const outcome = await readBusyWeek({ user, supabase, batchId });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Error reading busy week batch:", error);
    return NextResponse.json({ error: "Failed to read busy week batch" }, { status: 500 });
  }
}
