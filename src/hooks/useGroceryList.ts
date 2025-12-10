import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Ingredient, Recipe } from "@/types";

export function useGroceryList() {
    const { supabase, user } = useAuth();

    return useQuery({
        queryKey: ["groceryList", user?.id],
        queryFn: async () => {
            const { data } = await supabase
                .from("grocery_list")
                .select("*")
                .order("created_at", { ascending: false });

            return (
                (data as any[])?.map((g) => ({
                    name: g.name,
                    amount: g.amount,
                    unit: g.unit,
                    category: g.category,
                    id: g.id,
                    isChecked: g.is_checked,
                })) || []
            );
        },
        enabled: !!user,
    });
}

export function useAddToGroceryList() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async ({
            recipe,
            servings = 1,
        }: {
            recipe: Recipe;
            servings?: number;
        }) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const { data: currentList } = await supabase
                .from("grocery_list")
                .select("*");

            const updates: PromiseLike<any>[] = [];

            for (const ing of recipe.ingredients) {
                const scaledAmount = ing.amount * servings;
                const existingItem = currentList?.find(
                    (item) =>
                        item.name.toLowerCase() === ing.name.toLowerCase() &&
                        item.unit === ing.unit
                );

                if (existingItem) {
                    updates.push(
                        supabase
                            .from("grocery_list")
                            .update({ amount: existingItem.amount + scaledAmount })
                            .match({ id: existingItem.id })
                    );
                } else {
                    updates.push(
                        supabase.from("grocery_list").insert({
                            user_id: user.id,
                            name: ing.name,
                            amount: scaledAmount,
                            unit: ing.unit,
                            category: ing.category || "Other",
                        })
                    );
                }
            }

            await Promise.all(updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useAddCustomGroceryItem() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async (item: Omit<Ingredient, "id" | "isChecked">) => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) throw new Error("User not authenticated");

            const { data: currentList } = await supabase
                .from("grocery_list")
                .select("*");

            const existingItem = currentList?.find(
                (existing) =>
                    existing.name.toLowerCase() === item.name.toLowerCase() &&
                    existing.unit === item.unit
            );

            if (existingItem) {
                await supabase
                    .from("grocery_list")
                    .update({ amount: existingItem.amount + item.amount })
                    .match({ id: existingItem.id });
            } else {
                await supabase.from("grocery_list").insert({
                    user_id: user.id,
                    name: item.name,
                    amount: item.amount,
                    unit: item.unit,
                    category: item.category || "Other",
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useRemoveFromGroceryList() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async (itemId: string) => {
            await supabase.from("grocery_list").delete().match({ id: itemId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useToggleGroceryItem() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async ({
            itemId,
            isChecked,
        }: {
            itemId: string;
            isChecked: boolean;
        }) => {
            await supabase
                .from("grocery_list")
                .update({ is_checked: isChecked })
                .match({ id: itemId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useSelectAllGroceryItems() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async ({
            ids,
            isChecked,
        }: {
            ids: string[];
            isChecked: boolean;
        }) => {
            if (ids.length > 0) {
                await supabase
                    .from("grocery_list")
                    .update({ is_checked: isChecked })
                    .in("id", ids);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useClearGathered() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async (gatheredIds: string[]) => {
            if (gatheredIds.length === 0) return;
            await supabase.from("grocery_list").delete().in("id", gatheredIds);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}

export function useRemoveIngredientsForRecipe() {
    const queryClient = useQueryClient();
    const supabase = createClient();

    return useMutation({
        mutationFn: async ({
            recipe,
            servings = 1,
        }: {
            recipe: Recipe;
            servings?: number;
        }) => {
            const { data: currentList } = await supabase
                .from("grocery_list")
                .select("*");

            if (!currentList) return;

            const updates: PromiseLike<any>[] = [];
            const idsToRemove: string[] = [];

            for (const ing of recipe.ingredients) {
                const existingItem = currentList.find(
                    (item) =>
                        item.name.toLowerCase() === ing.name.toLowerCase() &&
                        item.unit === ing.unit
                );

                if (existingItem) {
                    const amountToRemove = ing.amount * servings;
                    const newAmount = existingItem.amount - amountToRemove;

                    if (newAmount <= 0.01) {
                        idsToRemove.push(existingItem.id);
                    } else {
                        updates.push(
                            supabase
                                .from("grocery_list")
                                .update({ amount: newAmount })
                                .match({ id: existingItem.id })
                        );
                    }
                }
            }

            if (idsToRemove.length > 0) {
                updates.push(
                    supabase.from("grocery_list").delete().in("id", idsToRemove)
                );
            }

            await Promise.all(updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["groceryList"] });
        },
    });
}
