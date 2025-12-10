import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Ingredient, Recipe } from "@/types";

export function useGroceryList() {
  const { supabase, user } = useAuth();

  return useQuery({
    queryKey: ["groceryList", user?.id],
    queryFn: async () => {
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from("grocery_list")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching grocery list:", error);
        throw error;
      }

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
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      recipe,
      servings = 1,
    }: {
      recipe: Recipe;
      servings?: number;
    }) => {
      if (!user) throw new Error("User not authenticated");

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useAddCustomGroceryItem() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async (item: Omit<Ingredient, "id" | "isChecked">) => {
      if (!user) throw new Error("User not authenticated");

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
        const { error } = await supabase
          .from("grocery_list")
          .update({ amount: existingItem.amount + item.amount })
          .match({ id: existingItem.id });

        if (error) {
          console.error("Error updating grocery item:", error);
          throw error;
        }
      } else {
        const { error } = await supabase.from("grocery_list").insert({
          user_id: user.id,
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          category: item.category || "Other",
        });

        if (error) {
          console.error("Error inserting grocery item:", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useRemoveFromGroceryList() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("grocery_list")
        .delete()
        .match({ id: itemId });
      if (error) {
        console.error("Error removing grocery item:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useToggleGroceryItem() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      itemId,
      isChecked,
    }: {
      itemId: string;
      isChecked: boolean;
    }) => {
      const { error } = await supabase
        .from("grocery_list")
        .update({ is_checked: isChecked })
        .match({ id: itemId });

      if (error) {
        console.error("Error toggling grocery item:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useSelectAllGroceryItems() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      ids,
      isChecked,
    }: {
      ids: string[];
      isChecked: boolean;
    }) => {
      if (ids.length > 0) {
        const { error } = await supabase
          .from("grocery_list")
          .update({ is_checked: isChecked })
          .in("id", ids);

        if (error) {
          console.error("Error selecting all grocery items:", error);
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useClearGathered() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async (gatheredIds: string[]) => {
      if (gatheredIds.length === 0) return;
      const { error } = await supabase
        .from("grocery_list")
        .delete()
        .in("id", gatheredIds);
      if (error) {
        console.error("Error clearing gathered items:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}

export function useRemoveIngredientsForRecipe() {
  const queryClient = useQueryClient();
  const { supabase, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      recipe,
      servings = 1,
    }: {
      recipe: Recipe;
      servings?: number;
    }) => {
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

      const results = await Promise.all(updates);
      const errors = results
        .map((r) => r.error)
        .filter((e) => e !== null && e !== undefined);

      if (errors.length > 0) {
        console.error("Error removing ingredients from grocery list:", errors);
        throw errors[0];
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groceryList", user?.id] });
    },
  });
}
