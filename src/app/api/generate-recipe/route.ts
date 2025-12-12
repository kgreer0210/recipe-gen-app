import { NextResponse } from "next/server";
import { Recipe, CuisineType, MealType, ProteinType } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { chatJson } from "@/lib/openrouter/chatJson";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed, remaining, error } = await checkRateLimit(5);

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "You've reached your daily recipe limit! 🧑‍🍳 Our chefs are taking a break. Please come back tomorrow for more delicious ideas.",
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
    } = body as {
      mode?: "classic" | "pantry";
      cuisine?: CuisineType;
      meal?: MealType;
      protein?: ProteinType;
      proteinCut?: string;
      ingredients?: string[];
      dietaryPreferences?: string[];
    };

    let prompt = "";
    let systemPrompt = `You are Mise AI, an expert culinary assistant created to help home cooks discover delicious, approachable recipes. You embody the expertise of a classically trained chef combined with the warmth of a home cooking enthusiast.

Your Core Principles:
- **Authenticity**: Honor the cultural origins of each cuisine. Use traditional techniques, authentic ingredient combinations, and respect regional variations.
- **Practicality**: Create recipes achievable in a home kitchen with commonly available ingredients. Suggest substitutions only when an ingredient may be hard to find.
- **Clarity**: Write instructions that are precise yet encouraging. A beginner should feel confident, while an experienced cook should find efficiency.
- **Flavor Balance**: Every recipe should have well-developed flavors—consider salt, acid, fat, heat, and umami in your compositions.
- **Single Serving Excellence**: Specialize in perfectly portioned single-serving recipes that don't sacrifice quality or variety.

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
      Generate a unique, high-quality, single-serving recipe based on the following available ingredients:
      Ingredients: ${ingredientsList}
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `Dietary Preferences/Allergies: ${dietaryPreferences.join(", ")}`
          : ""
      }

      
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
      - The recipe should primarily use the provided ingredients, but you may assume basic pantry staples (oil, salt, pepper, water, basic spices).
      - The recipe must be single-serving only.
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${dietaryPreferences.join(
              ", "
            )}.`
          : ""
      }
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "count", "clove", "slice".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - Instructions must be a step-by-step array of clear, concise cooking steps.
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

      // Build the protein description including the cut if specified
      const proteinDescription = proteinCut
        ? `${protein}, cut: ${proteinCut}`
        : protein;

      prompt = `
      Generate a unique, high-quality, single-serving recipe based on the following selections:
      Cuisine: ${cuisine}
      Meal: ${meal}
      Protein: ${proteinDescription}
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `Dietary Preferences/Allergies: ${dietaryPreferences.join(", ")}`
          : ""
      }

      
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
      - The recipe must be single-serving only.
      ${
        dietaryPreferences && dietaryPreferences.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${dietaryPreferences.join(
              ", "
            )}.`
          : ""
      }
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "count", "clove", "slice".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - Instructions must be a step-by-step array of clear, concise cooking steps.
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      - tags must exactly match (${cuisine}, ${meal}, ${proteinDescription}).
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;
    }

    const { data: recipeData } = await chatJson<Record<string, unknown>>(
      systemPrompt,
      prompt,
      {
        // Pantry mode can legitimately return { error: string } for invalid inputs.
        treatErrorFieldAsFailure: mode !== "pantry",
      }
    );

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

    // Add a random ID since the AI doesn't generate one
    const recipe: Recipe = {
      ...(recipeData as Omit<Recipe, "id">),
      id: Math.random().toString(36).substr(2, 9),
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
