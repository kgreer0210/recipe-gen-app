import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";

export function useRecipes() {
    const { supabase, user } = useAuth();

    return useQuery({
        queryKey: ["recipes", user?.id],
        queryFn: async () => {
            if (!user) {
                throw new Error("User not authenticated");
            }

            const { data, error } = await supabase
                .from("recipes")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Error fetching recipes:", error);
                throw error;
            }

            return (
                (data as any[])?.map((r) => ({
                    ...r,
                    prepTime: r.prep_time,
                    cookTime: r.cook_time,
                    ingredients: r.ingredients || [],
                    instructions: r.instructions || [],
                    tags: {
                        cuisine: r.cuisine,
                        meal: r.meal_type,
                        protein: r.protein || "None",
                    },
                })) || []
            );
        },
        enabled: !!user,
    });
}

export function useSaveRecipe() {
    const queryClient = useQueryClient();
    const { supabase, user } = useAuth();

    return useMutation({
        mutationFn: async (recipe: Recipe) => {
            if (!user) throw new Error("User not authenticated");

            const { data, error } = await supabase
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

            if (error) {
                console.error("Error saving recipe:", error);
                throw error;
            }
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
        },
    });
}

export function useRemoveRecipe() {
    const queryClient = useQueryClient();
    const { supabase, user } = useAuth();

    return useMutation({
        mutationFn: async (recipeId: string) => {
            const { error } = await supabase
                .from("recipes")
                .delete()
                .match({ id: recipeId });
            
            if (error) {
                console.error("Error removing recipe:", error);
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recipes", user?.id] });
        },
    });
}

