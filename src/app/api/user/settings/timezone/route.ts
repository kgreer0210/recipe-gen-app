import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";

// Handle CORS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { timezone } = await request.json();

    if (!timezone || typeof timezone !== "string") {
      return NextResponse.json(
        { error: "Timezone is required and must be a string" },
        { status: 400 }
      );
    }

    // Basic validation - timezone should be an IANA timezone string
    try {
      new Date().toLocaleString("en-US", { timeZone: timezone });
    } catch (err) {
      return NextResponse.json(
        { error: "Invalid timezone string" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Upsert user settings (create if doesn't exist, update if does)
    const { error } = await admin
      .from("user_settings")
      .upsert({
        user_id: user.id,
        timezone: timezone,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error updating user timezone:", error);
      return NextResponse.json(
        { error: "Failed to update timezone" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timezone: timezone,
    });
  } catch (error) {
    console.error("Error in timezone API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("user_settings")
      .select("timezone")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found"
      console.error("Error fetching user timezone:", error);
      return NextResponse.json(
        { error: "Failed to fetch timezone" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: data?.timezone || "UTC",
    });
  } catch (error) {
    console.error("Error in timezone GET API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
