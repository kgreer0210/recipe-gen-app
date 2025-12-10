import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";
import { useRecipes } from "./useRecipes";

export function useWeeklyPlan() {
    const { supabase, user } = useAuth();
    const { data: recipes } = useRecipes();

    return useQuery({
        queryKey: ["weeklyPlan", user?.id, recipes], // Depend on recipes to map correctly
        queryFn: async () => {
            const { data: weeklyPlanData } = await supabase
                .from("weekly_plan")
                .select("recipe_id")
                .order("created_at", { ascending: false });

            const weeklyPlanIds = new Set(
                (weeklyPlanData as any[])?.map((wp) => wp.recipe_id)
            );

            // If recipes aren't loaded yet, we can't fully construct the plan objects
            if (!recipes) return [];

            return recipes.filter((r: Recipe) => weeklyPlanIds.has(r.id));
        },
        enabled: !!user && !!recipes, // Only run when recipes are available
    });
}

export function useAddToWeeklyPlan() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async (recipe: Recipe) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            // Check if already exists? The UI usually handles this, but DB might have constraints.
            // The store checked `weeklyPlan.some`, we can rely on DB unique constraint or check here.
            // For now, just insert.
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
    const supabase = createClient();

    return useMutation({
        mutationFn: async (recipeId: string) => {
            const { error } = await supabase
                .from("weekly_plan")
                .delete()
                .match({ recipe_id: recipeId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["weeklyPlan"] });
        },
    });
}
