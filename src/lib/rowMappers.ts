import type { MealSlot, Recipe, WeeklyPlanSlot } from "@/types";

/**
 * Row shapes for the recipes and weekly_plan tables, mapped the same way as the
 * client hooks (useRecipesRealtime, useWeeklyPlanRealtime). Kept server-safe so
 * route handlers can use them without importing client hooks.
 */

export type RecipeRow = {
  id: string;
  user_id?: string;
  title: string;
  cuisine: string | null;
  meal_type: string | null;
  prep_time: string | null;
  cook_time: string | null;
  protein: string | null;
  ingredients: Recipe["ingredients"] | null;
  instructions: string[] | null;
  servings: number | null;
};

export type WeeklyPlanRow = {
  id: string;
  recipe_id: string;
  week_start: string;
  day_of_week: number | null;
  meal_slot: MealSlot | null;
  servings_override: number | null;
  cooked_at: string | null;
  created_at: string;
};

export function recipeRowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    // There is no description column; the client keeps the same empty value.
    description: "",
    prepTime: row.prep_time ?? "",
    cookTime: row.cook_time ?? "",
    ingredients: row.ingredients ?? [],
    instructions: row.instructions ?? [],
    tags: {
      cuisine: row.cuisine ?? "Other",
      meal: row.meal_type ?? "Dinner",
      protein: row.protein ?? "None",
    },
    servings:
      typeof row.servings === "number" && Number.isFinite(row.servings) ? row.servings : 1,
  };
}

/** Insert payload for recipes, matching useSaveRecipe's column choices. */
export function recipeToRow(recipe: Recipe, userId: string, servings: number) {
  return {
    user_id: userId,
    title: recipe.title,
    cuisine: recipe.tags?.cuisine || "Other",
    meal_type: recipe.tags?.meal || "Dinner",
    prep_time: recipe.prepTime,
    cook_time: recipe.cookTime,
    protein: recipe.tags?.protein || "None",
    ingredients: recipe.ingredients || [],
    instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
    servings,
  };
}

export function weeklyPlanRowToSlot(row: WeeklyPlanRow): WeeklyPlanSlot {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    weekStart: row.week_start,
    dayOfWeek: row.day_of_week,
    mealSlot: row.meal_slot,
    servingsOverride: row.servings_override,
    cookedAt: row.cooked_at,
    createdAt: row.created_at,
  };
}
