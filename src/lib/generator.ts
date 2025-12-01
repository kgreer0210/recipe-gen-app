import { Recipe, GenerateRecipeRequest } from "@/types";

export async function generateRecipe(
  params: GenerateRecipeRequest
): Promise<Recipe> {
  try {
    const response = await fetch("/api/generate-recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate recipe");
    }

    const recipe = await response.json();
    return recipe;
  } catch (error) {
    console.error("Error calling generate API:", error);
    throw error;
  }
}

export async function refineRecipe(
  currentRecipe: Recipe,
  instructions: string
): Promise<Recipe> {
  try {
    const response = await fetch("/api/refine-recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentRecipe, instructions }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to refine recipe");
    }

    const recipe = await response.json();
    return recipe;
  } catch (error) {
    console.error("Error calling refine API:", error);
    throw error;
  }
}
