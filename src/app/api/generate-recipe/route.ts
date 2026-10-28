import { NextResponse } from "next/server";
import {
  CuisineType,
  MealType,
  MEAL_STYLES,
  MealStyle,
  PROTEIN_CHOICES,
  ProteinChoice,
  ProteinType,
} from "@/types";
import { proteinConflict, proteinConflictMessage } from "@/lib/proteinChoice";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import {
  checkAndIncrementUsage,
  recordUsageTokens,
  getUsageErrorMessage,
} from "@/lib/usage";
import { getModelForTier, isValidAdminModelOverride } from "@/lib/openrouter/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { uniqueStrings } from "@/lib/kitchenProfile";
import {
  finalizeRecipe,
  requestRecipe,
} from "@/lib/recipe/generateRecipe";

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

    // Check usage before processing request
    const usageCheck = await checkAndIncrementUsage("generate", user);

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: getUsageErrorMessage(usageCheck.reason, usageCheck.planKey),
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      mode,
      cuisine,
      meal,
      protein,
      proteinCut,
      ingredients,
      dietaryPreferences,
      servings,
      mealStyle,
      adminModelOverride,
    } = body as {
      mode?: "classic" | "pantry";
      cuisine?: CuisineType;
      meal?: MealType;
      protein?: ProteinType | ProteinChoice;
      proteinCut?: string;
      ingredients?: string[];
      dietaryPreferences?: string[];
      servings?: number;
      mealStyle?: MealStyle;
      adminModelOverride?: string;
    };

    // Pantry takes the optional Protein choice ("Any" is the default and is left out). Classic keeps its required protein.
    if (
      mode === "pantry" &&
      protein !== undefined &&
      !PROTEIN_CHOICES.includes(protein as ProteinChoice)
    ) {
      return NextResponse.json({ error: "Unknown protein." }, { status: 400 });
    }
    const pantryProtein =
      mode === "pantry" && protein && protein !== "Any" ? (protein as ProteinChoice) : undefined;

    // Input validation to prevent token abuse
    if (mode === "pantry") {
      if (ingredients && ingredients.length > 50) {
        return NextResponse.json(
          { error: "Too many ingredients. Please limit to 50 items." },
          { status: 400 }
        );
      }
      if (ingredients && ingredients.some((ing) => ing.length > 200)) {
        return NextResponse.json(
          { error: "Individual ingredient names are too long." },
          { status: 400 }
        );
      }
    }

    if (dietaryPreferences && dietaryPreferences.length > 10) {
      return NextResponse.json(
        { error: "Too many dietary preferences. Please limit to 10." },
        { status: 400 }
      );
    }

    if (
      dietaryPreferences &&
      dietaryPreferences.some((pref) => pref.length > 100)
    ) {
      return NextResponse.json(
        { error: "Dietary preference names are too long." },
        { status: 400 }
      );
    }

    if (mealStyle !== undefined && !MEAL_STYLES.includes(mealStyle)) {
      return NextResponse.json({ error: "Unknown meal style." }, { status: 400 });
    }

    const normalizedServings =
      typeof servings === "number" && Number.isFinite(servings)
        ? Math.min(12, Math.max(1, Math.round(servings)))
        : 2;

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("dietary_preferences, disliked_ingredients, default_servings")
      .eq("user_id", user.id)
      .maybeSingle();

    const mergedDietary = uniqueStrings([
      ...(Array.isArray(settings?.dietary_preferences)
        ? settings.dietary_preferences
        : []),
      ...(dietaryPreferences ?? []),
    ]).slice(0, 10);
    const dislikedIngredients = uniqueStrings(
      Array.isArray(settings?.disliked_ingredients)
        ? settings.disliked_ingredients
        : []
    ).slice(0, 40);
    const servingsFromProfile =
      typeof settings?.default_servings === "number" &&
      Number.isFinite(settings.default_servings)
        ? Math.min(12, Math.max(1, Math.round(settings.default_servings)))
        : 2;
    const finalServings =
      typeof servings === "number" && Number.isFinite(servings)
        ? normalizedServings
        : servingsFromProfile;

    if (mode === "pantry") {
      if (!ingredients || ingredients.length === 0) {
        return NextResponse.json(
          { error: "No ingredients provided for Pantry Mode" },
          { status: 400 }
        );
      }
      // Saved preferences stay authoritative: a protein they rule out is rejected, not swapped.
      const conflict = pantryProtein ? proteinConflict(pantryProtein, mergedDietary) : null;
      if (pantryProtein && conflict) {
        return NextResponse.json(
          { error: proteinConflictMessage(pantryProtein, conflict) },
          { status: 400 }
        );
      }
    } else if (!cuisine || !meal || !protein) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Select model based on user's plan tier
    let modelToUse = getModelForTier(usageCheck.planKey);

    // Admin override with server-side verification
    if (adminModelOverride && usageCheck.planKey === "admin") {
      if (isValidAdminModelOverride(adminModelOverride)) {
        modelToUse = adminModelOverride;
        console.log(`[Admin Override] User ${user.id} using model: ${adminModelOverride}`);
      } else {
        console.warn(`[Admin Override] Invalid model rejected: ${adminModelOverride}`);
      }
    }

    const { data: recipeData, totalTokens } = await requestRecipe(
      {
        mode: mode === "pantry" ? "pantry" : "classic",
        cuisine,
        meal,
        protein: mode === "pantry" ? pantryProtein : protein,
        proteinCut,
        ingredients,
        dietaryPreferences: mergedDietary,
        dislikedIngredients,
        servings: finalServings,
        mealStyle,
      },
      modelToUse
    );

    // Record token usage (even if request fails, to prevent gaming)
    await recordUsageTokens("generate", user, totalTokens);

    // Handle validation error from AI
    if (
      recipeData &&
      typeof recipeData === "object" &&
      "error" in recipeData &&
      typeof (recipeData as { error?: unknown }).error === "string"
    ) {
      return NextResponse.json(
        { error: (recipeData as { error: string }).error },
        { status: 400 }
      );
    }

    return NextResponse.json(finalizeRecipe(recipeData, finalServings));
  } catch (error) {
    console.error("Error generating recipe:", error);
    return NextResponse.json(
      { error: "Failed to generate recipe" },
      { status: 500 }
    );
  }
}
