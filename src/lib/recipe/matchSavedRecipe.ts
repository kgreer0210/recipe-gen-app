type SavedRecipeLike = {
  id: string;
  servings?: number;
};

export type SavedRecipeMatch<T extends SavedRecipeLike> = {
  recipe: T;
  servings: number;
};

/**
 * Finds a saved recipe by id. An empty collection is treated as "not loaded
 * yet" and does not clear a previously shown recipe. Missing or non-positive
 * servings fall back to 1, matching the recipe page's previous effect.
 */
export function matchSavedRecipe<T extends SavedRecipeLike>(
  savedRecipes: readonly T[],
  id: string
): SavedRecipeMatch<T> | null {
  if (savedRecipes.length === 0) {
    return null;
  }
  const found = savedRecipes.find((recipe) => recipe.id === id);
  if (!found) {
    return null;
  }
  return { recipe: found, servings: found.servings || 1 };
}
