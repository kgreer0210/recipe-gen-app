import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Ingredient, Recipe } from "@/types";
import { useGroceryListStore } from "@/lib/stores/groceryListStore";

export function useAddToGroceryList() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async ({
    recipe,
    servings = 1,
  }: {
    recipe: Recipe;
    servings?: number;
  }) => {
    if (!user) throw new Error("User not authenticated");

    setIsLoading(true);
    setError(null);

    try {
      const { data: currentList, error: fetchError } = await supabase
        .from("grocery_list")
        .select("*");

      if (fetchError) {
        console.error("Error fetching current grocery list:", fetchError);
        throw fetchError;
      }

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

      const results = await Promise.all(updates);
      const errors = results
        .map((r) => r.error)
        .filter((e) => e !== null && e !== undefined);

      if (errors.length > 0) {
        console.error("Error updating grocery list:", errors);
        throw errors[0];
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to add to grocery list");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useAddCustomGroceryItem() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (item: Omit<Ingredient, "id" | "isChecked">) => {
    if (!user) throw new Error("User not authenticated");

    setIsLoading(true);
    setError(null);

    try {
      const { data: currentList, error: fetchError } = await supabase
        .from("grocery_list")
        .select("*");

      if (fetchError) {
        console.error("Error fetching current grocery list:", fetchError);
        throw fetchError;
      }

      const existingItem = currentList?.find(
        (existing) =>
          existing.name.toLowerCase() === item.name.toLowerCase() &&
          existing.unit === item.unit
      );

      if (existingItem) {
        const { error: updateError } = await supabase
          .from("grocery_list")
          .update({ amount: existingItem.amount + item.amount })
          .match({ id: existingItem.id });

        if (updateError) {
          console.error("Error updating grocery item:", updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase.from("grocery_list").insert({
          user_id: user.id,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          category: item.category || "Other",
        });

        if (insertError) {
          console.error("Error inserting grocery item:", insertError);
          throw insertError;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to add grocery item");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useRemoveFromGroceryList() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (itemId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("grocery_list")
        .delete()
        .match({ id: itemId });

      if (deleteError) {
        console.error("Error removing grocery item:", deleteError);
        throw deleteError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to remove grocery item");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useToggleGroceryItem() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async ({
    itemId,
    isChecked,
  }: {
    itemId: string;
    isChecked: boolean;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("grocery_list")
        .update({ is_checked: isChecked })
        .match({ id: itemId });

      if (updateError) {
        console.error("Error toggling grocery item:", updateError);
        throw updateError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to toggle grocery item");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useSelectAllGroceryItems() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async ({
    ids,
    isChecked,
  }: {
    ids: string[];
    isChecked: boolean;
  }) => {
    if (ids.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("grocery_list")
        .update({ is_checked: isChecked })
        .in("id", ids);

      if (updateError) {
        console.error("Error selecting all grocery items:", updateError);
        throw updateError;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to select all grocery items");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useClearGathered() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (gatheredIds: string[]) => {
    if (gatheredIds.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("grocery_list")
        .delete()
        .in("id", gatheredIds);

      if (deleteError) {
        console.error("Error clearing gathered items:", deleteError);
        throw deleteError;
      }

      // Optimistic local update: Realtime DELETE events may not fire (filtered subscriptions + DELETE payloads).
      const state = useGroceryListStore.getState();
      const remaining = state.groceryList.filter((i) => !i.id || !gatheredIds.includes(i.id));
      useGroceryListStore.getState().setGroceryList(remaining);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to clear gathered items");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}

export function useRemoveIngredientsForRecipe() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async ({
    recipe,
    servings = 1,
  }: {
    recipe: Recipe;
    servings?: number;
  }) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: currentList, error: fetchError } = await supabase
        .from("grocery_list")
        .select("*");

      if (fetchError) {
        console.error("Error fetching current grocery list:", fetchError);
        throw fetchError;
      }

      if (!currentList) return;

      const updates: PromiseLike<any>[] = [];
      const idsToRemove: string[] = [];
      const amountUpdatesById = new Map<string, number>();

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
            amountUpdatesById.set(existingItem.id, newAmount);
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

      const results = await Promise.all(updates);
      const errors = results
        .map((r) => r.error)
        .filter((e) => e !== null && e !== undefined);

      if (errors.length > 0) {
        console.error("Error removing ingredients from grocery list:", errors);
        throw errors[0];
      }

      // Optimistic local update: Realtime UPDATE/DELETE events may not fire reliably with filtered subscriptions.
      const state = useGroceryListStore.getState();
      const beforeCount = state.groceryList.length;
      const next = state.groceryList
        .filter((i) => !i.id || !idsToRemove.includes(i.id))
        .map((i) => {
          if (!i.id) return i;
          const nextAmount = amountUpdatesById.get(i.id);
          return nextAmount === undefined ? i : { ...i, amount: nextAmount };
        });
      useGroceryListStore.getState().setGroceryList(next);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to remove ingredients");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

