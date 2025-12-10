import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { useGroceryListStore } from "@/lib/stores/groceryListStore";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";

export function useSignOut() {
    const { supabase } = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const clearRecipes = useRecipesStore((state) => state.setRecipes);
    const clearGroceryList = useGroceryListStore((state) => state.setGroceryList);
    const clearWeeklyPlan = useWeeklyPlanStore((state) => state.setRecipeIds);

    const mutateAsync = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) throw signOutError;

            // Clear all Zustand stores
            clearRecipes([]);
            clearGroceryList([]);
            clearWeeklyPlan([]);

            router.push("/");
            router.refresh();
        } catch (err) {
            const error = err instanceof Error ? err : new Error("Failed to sign out");
            setError(error);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    return { mutateAsync, isLoading, error };
}
