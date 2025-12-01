import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@/types";

export function useRecipes() {
    const { supabase } = useAuth();

    return useQuery({
        queryKey: ["recipes"],
        queryFn: async () => {
            const { data } = await supabase
                .from("recipes")
                .select("*")
                .order("created_at", { ascending: false });

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
    });
}

export function useSaveRecipe() {
    const queryClient = useQueryClient();
    const { supabase } = useAuth();

    return useMutation({
        mutationFn: async (recipe: Recipe) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();

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

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recipes"] });
        },
    });
}

export function useRemoveRecipe() {
    const queryClient = useQueryClient();
    const { supabase } = useAuth();

    return useMutation({
        mutationFn: async (recipeId: string) => {
            const { error } = await supabase
                .from("recipes")
                .delete()
                .match({ id: recipeId });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["recipes"] });
        },
    });
}

