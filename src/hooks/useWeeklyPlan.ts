import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Recipe } from "@/types";
import { useAuth } from "./useAuth";
import { useRecipes } from "./useRecipes";

export function useWeeklyPlan() {
  const { supabase, user, loading: authLoading } = useAuth();
  const { data: recipes, isLoading: recipesLoading } = useRecipes();

  return useQuery({
    queryKey: ["weeklyPlan", user?.id, recipes],
    enabled: !!user && !authLoading && !!recipes && !recipesLoading,
    queryFn: async () => {
      if (!user || !recipes) return [];

      const { data: weeklyPlanData, error } = await supabase
        .from("weekly_plan")
        .select("recipe_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const weeklyPlanIds = new Set(
        (weeklyPlanData as any[])?.map((wp) => wp.recipe_id)
      );

      return recipes.filter((r: Recipe) => weeklyPlanIds.has(r.id));
    },
  });
}

export function useAddToWeeklyPlan() {
  const queryClient = useQueryClient();
  const { supabase } = useAuth();

  return useMutation({
    mutationFn: async (recipe: Recipe) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase.from("weekly_plan").insert({
        user_id: user.id,
        recipe_id: recipe.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weeklyPlan"] });
    },
  });
}

export function useRemoveFromWeeklyPlan() {
  const queryClient = useQueryClient();
  const { supabase } = useAuth();

  return useMutation({
    mutationFn: async (recipeId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error } = await supabase
        .from("weekly_plan")
        .delete()
        .match({ recipe_id: recipeId, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weeklyPlan"] });
    },
  });
}
