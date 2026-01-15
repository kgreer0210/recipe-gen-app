import { NextResponse } from "next/server";
import { Recipe, CuisineType, MealType, ProteinType } from "@/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth-helper";
import {
  checkAndIncrementUsage,
  recordUsageTokens,
  getUsageErrorMessage,
} from "@/lib/usage";
import { chatJson } from "@/lib/openrouter/chatJson";

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
    } = body as {
      mode?: "classic" | "pantry";
      cuisine?: CuisineType;
      meal?: MealType;
      protein?: ProteinType;
      proteinCut?: string;
      ingredients?: string[];
      dietaryPreferences?: string[];
      servings?: number;
    };

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

    const normalizedServings =
      typeof servings === "number" && Number.isFinite(servings)
        ? Math.min(12, Math.max(1, Math.round(servings)))
        : 2;

    let prompt = "";
    let systemPrompt = `You are Mise AI, an expert culinary assistant created to help home cooks discover delicious, approachable recipes. You embody the expertise of a classically trained chef combined with the warmth of a home cooking enthusiast.

Your Core Principles:
- **Authenticity**: Honor the cultural origins of each cuisine. Use traditional techniques, authentic ingredient combinations, and respect regional variations.
- **Practicality**: Create recipes achievable in a home kitchen with commonly available ingredients. Suggest substitutions only when an ingredient may be hard to find.
- **Clarity**: Write instructions that are precise yet encouraging. A beginner should feel confident, while an experienced cook should find efficiency.
- **Flavor Balance**: Every recipe should have well-developed flavors—consider salt, acid, fat, heat, and umami in your compositions.
- **Small Batch Excellence**: Specialize in recipes that serve 2 people by default, while still scaling cleanly for different serving sizes.
- **Variety & Exploration**: When generating recipes for a given cuisine and protein, explore the full breadth of that cuisine's cooking traditions. Consider multiple cooking techniques (braised, grilled, pan-seared, stir-fried, steamed, roasted, crispy-fried), diverse flavor profiles (spicy, umami-rich, tangy, sweet-savory, aromatic), and regional variations. Avoid defaulting to the most common or obvious preparation.

Your Personality:
- Passionate about food and eager to share culinary knowledge
- Encouraging and supportive, never condescending
- Creative but grounded in solid cooking fundamentals

Output Guidelines:
- Generate unique recipes that feel inspired, not generic
- Use descriptive, appetizing language in descriptions
- Ensure cooking times and temperatures are accurate and safe
- Consider the flow of a recipe—minimize unnecessary dish-dirtying and optimize prep order`;

    if (mode === "pantry") {
      if (!ingredients || ingredients.length === 0) {
        return NextResponse.json(
          { error: "No ingredients provided for Pantry Mode" },
          { status: 400 }
        );
      }

      const ingredientsList = ingredients.join(", ");

      prompt = `
      Generate a unique, high-quality recipe that serves exactly ${normalizedServings} people based on the following available ingredients:
      Ingredients: ${ingredientsList}
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `Dietary Preferences/Allergies: ${dietaryPreferences.join(", ")}`
          : ""
      }

      IMPORTANT: When creating this recipe, consider multiple possible approaches and cooking techniques that work with these ingredients. Choose an interesting, creative preparation rather than defaulting to the most obvious combination. Explore different flavor profiles, cooking methods, and cuisines if the ingredients allow for it.

      Your response must be ONLY a valid JSON object that matches this exact TypeScript interface:
      
      interface Recipe {
        title: string;
        description: string;
        ingredients: {
          name: string;
          amount: number;
          unit: string;
          category: "Produce" | "Meat" | "Dairy" | "Bakery" | "Frozen" | "Pantry" | "Spices" | "Other";
        }[];
        instructions: string[];
        tags: { cuisine: string; meal: string; protein: string };
        prepTime: string;
        cookTime: string;
        error?: string;
      }
      
      Requirements:
      - VALIDATION STEP: You must first validate the input ingredients. If the input contains non-food items, gibberish, or dangerous items, you MUST return a JSON object with a single "error" field explaining why the input is invalid. Example: { "error": "I can only cook with edible ingredients. Please remove 'rocks' from your list." }
      - Title format: Use English translations or descriptive English names for dishes. Keep titles clear and concise for English-speaking users.
      - The recipe should primarily use the provided ingredients, but you may assume basic pantry staples (oil, salt, pepper, water, basic spices).
      - The recipe must serve exactly ${normalizedServings} people.
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${dietaryPreferences.join(
              ", "
            )}.`
          : ""
      }
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "g", "kg", "ml", "l", "count", "clove", "slice", "pinch".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - CRITICAL - Ingredient Formatting: Ingredient names must be SIMPLE and contain NO preparation methods. Do NOT include terms like "minced", "diced", "chopped", "sliced", "crushed", "julienned", "grated", or any other cutting/cooking methods in ingredient names. Example: Use "2 clove garlic" NOT "2 clove garlic, minced". Use "1 cup onion" NOT "1 cup diced onion". ALL preparation instructions (mincing, dicing, chopping, etc.) must go in the cooking instructions/steps instead.
      - Instructions must be a step-by-step array of clear, concise cooking steps. Include ALL preparation methods here (e.g., "Mince the garlic", "Dice the onion", "Slice the chicken").
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      - tags: Infer the cuisine, meal, and protein based on the generated recipe.
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;
    } else {
      // Classic Mode
      if (!cuisine || !meal || !protein) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const cutPreference =
        proteinCut && proteinCut.trim().length > 0 ? proteinCut.trim() : "Any";

      prompt = `
      Generate a unique, high-quality recipe that serves exactly ${normalizedServings} people based on the following selections:
      Cuisine: ${cuisine}
      Meal: ${meal}
      Protein (base): ${protein}
      Protein cut preference: ${cutPreference}
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `Dietary Preferences/Allergies: ${dietaryPreferences.join(", ")}`
          : ""
      }

      IMPORTANT: Explore the full spectrum of ${cuisine} cuisine for ${protein} dishes. Consider:
      - Different cooking techniques: braising, grilling, pan-searing, stir-frying, steaming, roasting, deep-frying, smoking
      - Various flavor profiles: spicy, savory-sweet, tangy, umami-rich, aromatic, herb-forward
      - Regional variations and less common preparations within ${cuisine} cuisine
      - Aim for creative dishes that go beyond the most obvious or commonly known recipes

      Your response must be ONLY a valid JSON object that matches this exact TypeScript interface:
      
      interface Recipe {
        title: string;
        description: string;
        ingredients: {
          name: string;
          amount: number;
          unit: string;
          category: "Produce" | "Meat" | "Dairy" | "Bakery" | "Frozen" | "Pantry" | "Spices" | "Other";
        }[];
        instructions: string[];
        tags: { cuisine: string; meal: string; protein: string };
        prepTime: string;
        cookTime: string;
      }
      
      Requirements:
      - The recipe must clearly reflect the selected cuisine, meal type, and protein.
      - Title format: Use English translations or descriptive English names for the dish (e.g., "Roasted Red Pepper and Nduja Chicken" instead of the native language name). Keep titles clear and concise.
      - Use the protein cut preference when naming/selecting the ingredient (e.g., "chicken thighs"), but tags.protein must remain the base protein.
      - The recipe must serve exactly ${normalizedServings} people.
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${dietaryPreferences.join(
              ", "
            )}.`
          : ""
      }
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "g", "kg", "ml", "l", "count", "clove", "slice", "pinch".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - CRITICAL - Ingredient Formatting: Ingredient names must be SIMPLE and contain NO preparation methods. Do NOT include terms like "minced", "diced", "chopped", "sliced", "crushed", "julienned", "grated", or any other cutting/cooking methods in ingredient names. Example: Use "2 clove garlic" NOT "2 clove garlic, minced". Use "1 cup onion" NOT "1 cup diced onion". ALL preparation instructions (mincing, dicing, chopping, etc.) must go in the cooking instructions/steps instead.
      - Instructions must be a step-by-step array of clear, concise cooking steps. Include ALL preparation methods here (e.g., "Mince the garlic", "Dice the onion", "Slice the chicken").
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      - tags must exactly match (${cuisine}, ${meal}, ${protein}).
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;
    }

    const { data: recipeData, usage } = await chatJson<Record<string, unknown>>(
      systemPrompt,
      prompt,
      {
        // Pantry mode can legitimately return { error: string } for invalid inputs.
        treatErrorFieldAsFailure: mode !== "pantry",
      }
    );

    // Record token usage (even if request fails, to prevent gaming)
    await recordUsageTokens("generate", user, usage?.totalTokens);

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

    // Add server-controlled fields since the AI doesn't generate them reliably.
    const recipe: Recipe = {
      ...(recipeData as Omit<Recipe, "id" | "servings">),
      id: Math.random().toString(36).substr(2, 9),
      servings: normalizedServings,
      // For pantry mode, tags are inferred by AI, so we use what's returned.
      // For classic mode, we could enforce them, but trusting the AI's return (which we instructed to match) is fine.
    };

    return NextResponse.json(recipe);
  } catch (error) {
    console.error("Error generating recipe:", error);
    return NextResponse.json(
      { error: "Failed to generate recipe" },
      { status: 500 }
    );
  }
}
