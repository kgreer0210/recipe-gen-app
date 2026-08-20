import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { useGroceryListStore } from "@/lib/stores/groceryListStore";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { usePantryStore } from "@/lib/stores/pantryStore";

export function useSignOut() {
    const { supabase } = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    
    const clearRecipes = useRecipesStore((state) => state.setRecipes);
    const clearGroceryList = useGroceryListStore((state) => state.setGroceryList);
    const clearWeeklyPlan = useWeeklyPlanStore((state) => state.setSlots);

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
            usePantryStore.getState().setPantryItems([]);

            // After sign out, always return the user to the sign-in page.
            router.replace("/login");
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
