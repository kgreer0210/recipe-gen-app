import type { MealType } from "@/types";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

export type GeneratorSearchQuery = {
  mode: string | null;
  ingredients: string | null;
  meal: string | null;
};

export type GeneratorQueryPatch = {
  mode?: "pantry";
  ingredientsInput?: string;
  meal?: MealType;
};

function isMealType(value: string): value is MealType {
  return (MEAL_TYPES as readonly string[]).includes(value);
}

/**
 * Maps the generator URL query into the one-shot wizard state update.
 * Returns null when none of the recognized params are present so the form
 * keeps its defaults.
 */
export function generatorQueryPatch(
  query: GeneratorSearchQuery
): GeneratorQueryPatch | null {
  if (!query.mode && !query.ingredients && !query.meal) {
    return null;
  }

  const patch: GeneratorQueryPatch = {};
  if (query.mode === "pantry" || query.ingredients) {
    patch.mode = "pantry";
  }
  if (query.ingredients) {
    patch.ingredientsInput = query.ingredients;
  }
  if (query.meal && isMealType(query.meal)) {
    patch.meal = query.meal;
  }
  return patch;
}
