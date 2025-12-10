import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";

export function useAddToWeeklyPlan() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (recipe: Recipe) => {
    if (!user) throw new Error("User not authenticated");

    setIsLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase.from("weekly_plan").insert({
        user_id: user.id,
        recipe_id: recipe.id,
      });

      if (insertError) {
        console.error("Error adding to weekly plan:", insertError);
        throw insertError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to add to weekly plan");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useRemoveFromWeeklyPlan() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (recipeId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("weekly_plan")
        .delete()
        .match({ recipe_id: recipeId });

      if (deleteError) {
        console.error("Error removing from weekly plan:", deleteError);
        throw deleteError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to remove from weekly plan");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

