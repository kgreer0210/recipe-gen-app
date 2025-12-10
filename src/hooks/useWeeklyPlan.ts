import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";
import { useRecipes } from "./useRecipes";

export function useWeeklyPlan() {
    const { supabase, user } = useAuth();
    const { data: recipes } = useRecipes();

    return useQuery({
        queryKey: ["weeklyPlan", user?.id, recipes], // Depend on recipes to map correctly
        queryFn: async () => {
            if (!user) {
                throw new Error("User not authenticated");
            }

            const { data: weeklyPlanData, error } = await supabase
                .from("weekly_plan")
                .select("recipe_id")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching weekly plan:", error);
                throw error;
            }

            const weeklyPlanIds = new Set(
                (weeklyPlanData as any[])?.map((wp) => wp.recipe_id)
            );

            // If recipes aren't loaded yet, we can't fully construct the plan objects
            if (!recipes) return [];

            return recipes.filter((r: Recipe) => weeklyPlanIds.has(r.id));
        },
        enabled: !!user && !!recipes, // Only run when user is authenticated and recipes are available
    });
}

export function useAddToWeeklyPlan() {
    const queryClient = useQueryClient();
    const { supabase, user } = useAuth();

    return useMutation({
        mutationFn: async (recipe: Recipe) => {
            if (!user) throw new Error("User not authenticated");

            // Check if already exists? The UI usually handles this, but DB might have constraints.
            // The store checked `weeklyPlan.some`, we can rely on DB unique constraint or check here.
            // For now, just insert.
            const { error } = await supabase.from("weekly_plan").insert({
                user_id: user.id,
                recipe_id: recipe.id,
            });

            if (error) {
                console.error("Error adding to weekly plan:", error);
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["weeklyPlan", user?.id] });
        },
    });
}

export function useRemoveFromWeeklyPlan() {
    const queryClient = useQueryClient();
    const { supabase, user } = useAuth();

    return useMutation({
        mutationFn: async (recipeId: string) => {
            const { error } = await supabase
                .from("weekly_plan")
                .delete()
                .match({ recipe_id: recipeId });
            
            if (error) {
                console.error("Error removing from weekly plan:", error);
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["weeklyPlan", user?.id] });
        },
    });
}
