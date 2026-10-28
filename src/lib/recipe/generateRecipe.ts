import "server-only";

import type { CuisineType, MealStyle, MealType, ProteinType, Recipe } from "@/types";
import { MEAL_STYLES } from "@/types";
import { chatJson } from "@/lib/openrouter/chatJson";

/**
 * Shared recipe generation for /api/generate-recipe and Busy week.
 * Prompt text is kept byte-for-byte with the original route when no meal style
 * and no avoid list are given (see tests/unit/generate-recipe-route.test.ts).
 */

export type RecipeGenerationInput = {
  mode: "classic" | "pantry";
  cuisine?: CuisineType;
  meal?: MealType;
  /** Omitted for Busy week: the model picks a base protein that suits the dish. */
  protein?: ProteinType;
  proteinCut?: string;
  ingredients?: string[];
  dietaryPreferences: string[];
  dislikedIngredients: string[];
  servings: number;
  mealStyle?: MealStyle;
  /** Titles already made for this cuisine in the same batch. */
  avoidTitles?: string[];
};

export type RecipeGenerationPrompts = {
  systemPrompt: string;
  prompt: string;
  treatErrorFieldAsFailure: boolean;
};

const STYLE_GUIDANCE: Record<Exclude<MealStyle, "Any">, string> = {
  Bowl: "a single bowl with a base (grain, noodles or greens), the protein and toppings arranged in it",
  Plate: "a composed plated dinner with a clear main, a side and a sauce",
  Taco: "tacos or small tortilla bites with toppings that can be built at the table",
  Sandwich: "a sandwich or hoagie on bread or a roll, built to eat in the hand",
  Wrap: "a wrap or burrito rolled in a flatbread or tortilla",
  Pizza: "a pizza or flatbread with a base, sauce, toppings and cheese, baked until blistered",
  Pasta: "a pasta dish with the sauce tossed through the cooked pasta",
  Soup: "a soup or stew served in a bowl with plenty of broth",
  Salad: "a salad with a dressing, with the protein and vegetables tossed together",
  Skewers: "skewers or kebabs, threaded and cooked on a grill, in a pan or in the oven",
};

/** A blank prompt line that keeps its six-space indent, as the original prompt did. */
const INDENTED_BLANK = "      ";

const SYSTEM_PROMPT = `You are Mise AI, an expert culinary assistant created to help home cooks discover delicious, approachable recipes. You embody the expertise of a classically trained chef combined with the warmth of a home cooking enthusiast.

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

/** Extra requirement lines, empty when there is nothing to add (keeps the default prompt identical). */
function extraRequirements(input: RecipeGenerationInput): string {
  let extra = "";
  if (input.mealStyle && input.mealStyle !== "Any") {
    if (!MEAL_STYLES.includes(input.mealStyle)) {
      throw new Error(`Unknown meal style: ${input.mealStyle}`);
    }
    extra += `\n      - Meal style: ${input.mealStyle}. Make it ${STYLE_GUIDANCE[input.mealStyle]}.`;
  }
  if (input.avoidTitles && input.avoidTitles.length > 0) {
    extra += `\n      - Important: avoid these dishes: ${input.avoidTitles.join(", ")}. Create something clearly different.`;
  }
  return extra;
}

export function buildRecipePrompts(input: RecipeGenerationInput): RecipeGenerationPrompts {
  const { dietaryPreferences, dislikedIngredients, servings } = input;
  const mergedDietary = dietaryPreferences;

  const dietaryBlock =
    mergedDietary.length > 0
      ? `Dietary Preferences/Allergies: ${mergedDietary.join(", ")}`
      : "";
  const avoidBlock =
    dislikedIngredients.length > 0
      ? `STRICTLY AVOID these ingredients: ${dislikedIngredients.join(", ")}.`
      : "";
  const extra = extraRequirements(input);

  if (input.mode === "pantry") {
    const ingredients = input.ingredients ?? [];
    const ingredientsList = ingredients.join(", ");

    const prompt = `
      Generate a unique, high-quality recipe that serves exactly ${servings} people based on the following available ingredients:
      Ingredients: ${ingredientsList}
      ${dietaryBlock}
      ${avoidBlock}

      IMPORTANT: When creating this recipe, consider multiple possible approaches and cooking techniques that work with these ingredients. Choose an interesting, creative preparation rather than defaulting to the most obvious combination. Explore different flavor profiles, cooking methods, and cuisines if the ingredients allow for it.

      Your response must be ONLY a valid JSON object that matches this exact TypeScript interface:
${INDENTED_BLANK}
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
${INDENTED_BLANK}
      Requirements:
      - VALIDATION STEP: You must first validate the input ingredients. If the input contains non-food items, gibberish, or dangerous items, you MUST return a JSON object with a single "error" field explaining why the input is invalid. Example: { "error": "I can only cook with edible ingredients. Please remove 'rocks' from your list." }
      - Title format: Use English translations or descriptive English names for dishes. Keep titles clear and concise for English-speaking users.
      - The recipe should primarily use the provided ingredients, but you may assume basic pantry staples (oil, salt, pepper, water, basic spices).${extra}
      - The recipe must serve exactly ${servings} people.
      ${
        mergedDietary.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${mergedDietary.join(
              ", "
            )}.`
          : ""
      }
      ${avoidBlock ? `- ${avoidBlock}` : ""}
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "g", "kg", "ml", "l", "count", "clove", "slice", "pinch".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - CRITICAL - Ingredient Formatting: Ingredient names must be SIMPLE and contain NO preparation methods. Do NOT include terms like "minced", "diced", "chopped", "sliced", "crushed", "julienned", "grated", or any other cutting/cooking methods in ingredient names. Example: Use "2 clove garlic" NOT "2 clove garlic, minced". Use "1 cup onion" NOT "1 cup diced onion". ALL preparation instructions (mincing, dicing, chopping, etc.) must go in the cooking instructions/steps instead.
      - Instructions must be a step-by-step array of clear, concise cooking steps. Include ALL preparation methods here (e.g., "Mince the garlic", "Dice the onion", "Slice the chicken").
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      - tags: Infer the cuisine, meal, and protein based on the generated recipe.
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;

    return {
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      treatErrorFieldAsFailure: false,
    };
  }

  // Classic Mode. Busy week leaves protein unset and lets the model choose it.
  const cutPreference =
    input.proteinCut && input.proteinCut.trim().length > 0 ? input.proteinCut.trim() : "Any";
  const cuisine = input.cuisine;
  const meal = input.meal;
  const protein = input.protein;
  const proteinLine = protein
    ? `Protein (base): ${protein}`
    : "Protein (base): Chef's choice. Pick the base protein that best suits this cuisine and meal style, within the dietary preferences.";
  const proteinCutLine = protein
    ? `Protein cut preference: ${cutPreference}`
    : "Protein cut preference: Any";
  const tagsRequirement = protein
    ? `- tags must exactly match (${cuisine}, ${meal}, ${protein}).`
    : `- tags.cuisine must be ${cuisine} and tags.meal must be ${meal}. tags.protein must name the base protein you chose.`;

  const prompt = `
      Generate a unique, high-quality recipe that serves exactly ${servings} people based on the following selections:
      Cuisine: ${cuisine}
      Meal: ${meal}
      ${proteinLine}
      ${proteinCutLine}
      ${dietaryBlock}
      ${avoidBlock}

      IMPORTANT: Explore the full spectrum of ${cuisine} cuisine for ${protein ?? "the chosen protein"} dishes. Consider:
      - Different cooking techniques: braising, grilling, pan-searing, stir-frying, steaming, roasting, deep-frying, smoking
      - Various flavor profiles: spicy, savory-sweet, tangy, umami-rich, aromatic, herb-forward
      - Regional variations and less common preparations within ${cuisine} cuisine
      - Aim for creative dishes that go beyond the most obvious or commonly known recipes

      Your response must be ONLY a valid JSON object that matches this exact TypeScript interface:
${INDENTED_BLANK}
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
${INDENTED_BLANK}
      Requirements:
      - The recipe must clearly reflect the selected cuisine, meal type, and protein.${extra}
      - Title format: Use English translations or descriptive English names for the dish (e.g., "Roasted Red Pepper and Nduja Chicken" instead of the native language name). Keep titles clear and concise.
      - Use the protein cut preference when naming/selecting the ingredient (e.g., "chicken thighs"), but tags.protein must remain the base protein.
      - The recipe must serve exactly ${servings} people.
      ${
        mergedDietary.length > 0
          ? `- STRICTLY ADHERE to these dietary preferences: ${mergedDietary.join(
              ", "
            )}.`
          : ""
      }
      ${avoidBlock ? `- ${avoidBlock}` : ""}
      - All ingredient amounts must be numeric and use one of the following units: "lb", "oz", "cup", "tbsp", "tsp", "g", "kg", "ml", "l", "count", "clove", "slice", "pinch".
      - For Meat-category ingredients: avoid fractional pounds. If the amount is under 1 lb, prefer ounces (e.g., 4 oz, 6 oz, 8 oz, 12 oz) instead of values like 0.25 lb.
      - Categorize ingredients accurately.
      - CRITICAL - Ingredient Formatting: Ingredient names must be SIMPLE and contain NO preparation methods. Do NOT include terms like "minced", "diced", "chopped", "sliced", "crushed", "julienned", "grated", or any other cutting/cooking methods in ingredient names. Example: Use "2 clove garlic" NOT "2 clove garlic, minced". Use "1 cup onion" NOT "1 cup diced onion". ALL preparation instructions (mincing, dicing, chopping, etc.) must go in the cooking instructions/steps instead.
      - Instructions must be a step-by-step array of clear, concise cooking steps. Include ALL preparation methods here (e.g., "Mince the garlic", "Dice the onion", "Slice the chicken").
      - prepTime and cookTime should be realistic human-readable strings (e.g., "10 minutes").
      ${tagsRequirement}
      - Do NOT include any extra text, comments, or markdown—return ONLY the JSON object.
      `;

  return {
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    treatErrorFieldAsFailure: true,
  };
}

/** Calls the model once. Throws on transport or parse failure; the caller decides what to record. */
export async function requestRecipe(
  input: RecipeGenerationInput,
  model: string
): Promise<{ data: Record<string, unknown>; totalTokens: number | undefined }> {
  const { systemPrompt, prompt, treatErrorFieldAsFailure } = buildRecipePrompts(input);
  const { data, usage } = await chatJson<Record<string, unknown>>(systemPrompt, prompt, {
    treatErrorFieldAsFailure,
    model,
  });
  return { data, totalTokens: usage?.totalTokens };
}

/** Adds the fields the AI does not produce reliably. */
export function finalizeRecipe(data: Record<string, unknown>, servings: number): Recipe {
  return {
    ...(data as Omit<Recipe, "id" | "servings">),
    id: Math.random().toString(36).substr(2, 9),
    servings,
  };
}
