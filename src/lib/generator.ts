import { Recipe, CuisineType, MealType, ProteinType } from "@/types";

export async function generateRecipe(
  cuisine: CuisineType,
  meal: MealType,
  protein: ProteinType,
  proteinCut?: string
): Promise<Recipe> {
  try {
    const response = await fetch("/api/generate-recipe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cuisine, meal, protein, proteinCut }),
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
