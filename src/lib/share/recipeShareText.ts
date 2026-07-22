"use client";

import { toast } from "sonner";
import type { Recipe } from "@/types";
import { formatRecipeAmount } from "@/lib/grocery/format";

interface BuildShareTextOptions {
  includeInstructions: boolean;
  servingsOverride?: number;
}

export function buildRecipeShareText(
  recipe: Recipe,
  { includeInstructions, servingsOverride }: BuildShareTextOptions
): string {
  const servings = servingsOverride ?? recipe.servings;
  const scale = recipe.servings ? servings / recipe.servings : 1;

  const lines: string[] = [
    recipe.title,
    `${recipe.tags.cuisine} | ${recipe.tags.meal} | ${recipe.tags.protein}`,
    `Prep: ${recipe.prepTime} | Cook: ${recipe.cookTime} | Serves: ${servings}`,
    "",
    "Ingredients:",
    ...recipe.ingredients.map(
      (ingredient) =>
        `- ${formatRecipeAmount(ingredient.amount * scale, ingredient.unit)} ${
          ingredient.unit
        } ${ingredient.name}`
    ),
  ];

  if (includeInstructions && recipe.instructions.length > 0) {
    lines.push("", "Instructions:");
    lines.push(
      ...recipe.instructions.map((step, index) => `${index + 1}. ${step}`)
    );
  }

  return lines.join("\n");
}

export async function shareRecipe(title: string, text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (error) {
      // User dismissed the share sheet - not an error.
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // Otherwise fall through to the clipboard fallback.
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    toast.success("Recipe copied to clipboard");
  } catch {
    toast.error("Could not share recipe");
  }
}
