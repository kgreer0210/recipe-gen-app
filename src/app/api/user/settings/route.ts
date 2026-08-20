import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { uniqueStrings } from "@/lib/kitchenProfile";

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

function clampServings(value: unknown, fallback = 4): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(12, Math.max(1, Math.round(value)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value.filter((item): item is string => typeof item === "string")
  );
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
      .select(
        "timezone, default_servings, dietary_preferences, disliked_ingredients"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone: data?.timezone || "UTC",
      defaultServings: clampServings(data?.default_servings, 4),
      dietaryPreferences: asStringArray(data?.dietary_preferences),
      dislikedIngredients: asStringArray(data?.disliked_ingredients),
    });
  } catch (error) {
    console.error("Error in settings GET API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      timezone?: unknown;
      defaultServings?: unknown;
      dietaryPreferences?: unknown;
      dislikedIngredients?: unknown;
    };

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("user_settings")
      .select(
        "timezone, default_servings, dietary_preferences, disliked_ingredients"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone
        : existing?.timezone || "UTC";

    try {
      new Date().toLocaleString("en-US", { timeZone: timezone });
    } catch {
      return NextResponse.json(
        { error: "Invalid timezone string" },
        { status: 400 }
      );
    }

    const defaultServings =
      body.defaultServings === undefined
        ? clampServings(existing?.default_servings, 4)
        : clampServings(body.defaultServings, 4);
    const dietaryPreferences =
      body.dietaryPreferences === undefined
        ? asStringArray(existing?.dietary_preferences)
        : asStringArray(body.dietaryPreferences).slice(0, 10);
    const dislikedIngredients =
      body.dislikedIngredients === undefined
        ? asStringArray(existing?.disliked_ingredients)
        : asStringArray(body.dislikedIngredients).slice(0, 40);

    const { error } = await admin.from("user_settings").upsert({
      user_id: user.id,
      timezone,
      default_servings: defaultServings,
      dietary_preferences: dietaryPreferences,
      disliked_ingredients: dislikedIngredients,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error updating user settings:", error);
      return NextResponse.json(
        { error: "Failed to update settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      timezone,
      defaultServings,
      dietaryPreferences,
      dislikedIngredients,
    });
  } catch (error) {
    console.error("Error in settings POST API:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
