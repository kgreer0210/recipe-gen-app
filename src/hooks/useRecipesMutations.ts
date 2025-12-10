import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";

export function useSaveRecipe() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (recipe: Recipe) => {
    if (!user) throw new Error("User not authenticated");

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: insertError } = await supabase
        .from("recipes")
        .insert({
          user_id: user.id,
          title: recipe.title,
          cuisine: recipe.tags?.cuisine || "Other",
          meal_type: recipe.tags?.meal || "Dinner",
          prep_time: recipe.prepTime,
          cook_time: recipe.cookTime,
          protein: recipe.tags?.protein || "None",
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving recipe:", insertError);
        throw insertError;
      }

      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to save recipe");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useRemoveRecipe() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (recipeId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("recipes")
        .delete()
        .match({ id: recipeId });

      if (deleteError) {
        console.error("Error removing recipe:", deleteError);
        throw deleteError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to remove recipe");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

