import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Ingredient, Recipe } from "@/types";
import { useGroceryListStore } from "@/lib/stores/groceryListStore";
import { usePantryStore } from "@/lib/stores/pantryStore";
import { useRecipesStore } from "@/lib/stores/recipesStore";
import { useWeeklyPlanStore } from "@/lib/stores/weeklyPlanStore";
import { normalizeIngredientName } from "@/lib/grocery/normalize";
import { canonicalizeIngredientForGroceryList } from "@/lib/grocery/canonicalize";
import { fetchUnitProfiles } from "@/lib/grocery/unitProfiles";
import {
  aggregateRecipeIngredients,
  ingredientsToCanonicalLines,
  mergeCanonicalIngredients,
  subtractPantryStock,
  type AggregatedIngredient,
} from "@/lib/grocery/aggregateIngredients";
import type { CanonicalizedIngredient } from "@/lib/grocery/canonicalize";

export function useAddToGroceryList() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async ({
    recipe,
    servings = 1,
    baseServings = 1,
  }: {
    recipe: Recipe;
    servings?: number;
    baseServings?: number;
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

      const scale =
        baseServings && Number.isFinite(baseServings) && baseServings > 0
          ? servings / baseServings
          : servings;

      const normalizedNames = recipe.ingredients.map((ing) =>
        normalizeIngredientName(ing.name)
      );
      const profiles = await fetchUnitProfiles(supabase, normalizedNames);
      const aggregated = aggregateRecipeIngredients({
        ingredients: recipe.ingredients,
        scale,
        profiles,
      });

      const updates: PromiseLike<{ error: unknown }>[] = [];

      for (const line of aggregated) {
        const existingItem = currentList?.find((item) => {
          const itemNameNorm =
            typeof item.name_normalized === "string"
              ? item.name_normalized
              : normalizeIngredientName(String(item.name ?? ""));
          return itemNameNorm === line.nameNormalized && item.unit === line.unit;
        });

        if (existingItem) {
          updates.push(
            supabase
              .from("grocery_list")
              .update({ amount: existingItem.amount + line.amount })
              .match({ id: existingItem.id })
          );
        } else {
          updates.push(
            supabase.from("grocery_list").insert({
              user_id: user.id,
              name: line.displayName,
              name_normalized: line.nameNormalized,
              amount: line.amount,
              unit: line.unit,
              category: line.category || "Other",
              source: "manual",
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

      const nameNorm = normalizeIngredientName(item.name);
      const profiles = await fetchUnitProfiles(supabase, [nameNorm]);
      const profile = profiles.get(nameNorm);
      if (profile?.exclude_always) {
        return;
      }
      const canonical = canonicalizeIngredientForGroceryList(item, profile);

      const existingItem = currentList?.find((existing) => {
        const existingNorm =
          typeof existing.name_normalized === "string"
            ? existing.name_normalized
            : normalizeIngredientName(String(existing.name ?? ""));
        return existingNorm === canonical.nameNormalized && existing.unit === canonical.unit;
      });

      if (existingItem) {
        const { error: updateError } = await supabase
          .from("grocery_list")
          .update({ amount: existingItem.amount + canonical.amount })
          .match({ id: existingItem.id });

        if (updateError) {
          console.error("Error updating grocery item:", updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase.from("grocery_list").insert({
          user_id: user.id,
          name: canonical.displayName,
          name_normalized: canonical.nameNormalized,
          amount: canonical.amount,
          unit: canonical.unit,
          category: canonical.category || "Other",
          source: "manual",
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

      // Optimistic local update: Realtime DELETE events may not fire (filtered subscriptions + DELETE payloads).
      useGroceryListStore.getState().removeItem(itemId);
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
    baseServings = 1,
  }: {
    recipe: Recipe;
    servings?: number;
    baseServings?: number;
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
      const scale =
        baseServings && Number.isFinite(baseServings) && baseServings > 0
          ? servings / baseServings
          : servings;

      const normalizedNames = recipe.ingredients.map((ing) =>
        normalizeIngredientName(ing.name)
      );
      const profiles = await fetchUnitProfiles(supabase, normalizedNames);

      for (const ing of recipe.ingredients) {
        const nameNorm = normalizeIngredientName(ing.name);
        const profile = profiles.get(nameNorm);
        if (profile?.exclude_always) {
          continue;
        }
        const canonical = canonicalizeIngredientForGroceryList(ing, profile);
        const existingItem = currentList.find((item) => {
          const itemNameNorm =
            typeof item.name_normalized === "string"
              ? item.name_normalized
              : normalizeIngredientName(String(item.name ?? ""));
          return itemNameNorm === canonical.nameNormalized && item.unit === canonical.unit;
        });

        if (existingItem) {
          const amountToRemove = canonical.amount * scale;
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

export function useBuildGroceryFromWeek() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (weekStart: string): Promise<number> => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);

    try {
      const slots = useWeeklyPlanStore
        .getState()
        .slots.filter(
          (slot) => slot.weekStart === weekStart && !slot.cookedAt
        );
      if (slots.length === 0) {
        throw new Error("No uncooked meals in this week to shop for");
      }

      const recipesById = new Map(
        useRecipesStore.getState().recipes.map((recipe) => [recipe.id, recipe])
      );
      const missingIds = slots
        .map((slot) => slot.recipeId)
        .filter((id) => !recipesById.has(id));
      if (missingIds.length > 0) {
        const { data, error: recipeError } = await supabase
          .from("recipes")
          .select("*")
          .in("id", missingIds);
        if (recipeError) throw recipeError;
        for (const row of data || []) {
          recipesById.set(row.id, {
            id: row.id,
            title: row.title,
            description: row.description || "",
            prepTime: row.prep_time,
            cookTime: row.cook_time,
            ingredients: row.ingredients || [],
            instructions: row.instructions || [],
            tags: {
              cuisine: row.cuisine,
              meal: row.meal_type,
              protein: row.protein || "None",
            },
            servings:
              typeof row.servings === "number" && Number.isFinite(row.servings)
                ? row.servings
                : 1,
          });
        }
      }

      const allCanonical: CanonicalizedIngredient[] = [];
      const namesForProfiles: string[] = [];
      for (const slot of slots) {
        const recipe = recipesById.get(slot.recipeId);
        if (!recipe) continue;
        for (const ingredient of recipe.ingredients) {
          namesForProfiles.push(normalizeIngredientName(ingredient.name));
        }
      }
      const profiles = await fetchUnitProfiles(supabase, namesForProfiles);

      for (const slot of slots) {
        const recipe = recipesById.get(slot.recipeId);
        if (!recipe) continue;
        const servings = slot.servingsOverride ?? recipe.servings ?? 1;
        const scale =
          recipe.servings && recipe.servings > 0
            ? servings / recipe.servings
            : servings;
        allCanonical.push(
          ...ingredientsToCanonicalLines(recipe.ingredients, scale, profiles)
        );
      }

      const pantry = usePantryStore.getState().pantryItems;
      const aggregated: AggregatedIngredient[] = subtractPantryStock(
        mergeCanonicalIngredients(allCanonical),
        pantry.map((item) => ({
          nameNormalized: item.nameNormalized,
          amount: item.amount,
          unit: item.unit,
        }))
      );

      const { error: deleteError } = await supabase
        .from("grocery_list")
        .delete()
        .eq("user_id", user.id)
        .eq("source", "plan")
        .eq("plan_week_start", weekStart);
      if (deleteError) throw deleteError;

      if (aggregated.length > 0) {
        const { error: insertError } = await supabase.from("grocery_list").insert(
          aggregated.map((line) => ({
            user_id: user.id,
            name: line.displayName,
            name_normalized: line.nameNormalized,
            amount: line.amount,
            unit: line.unit,
            category: line.category || "Other",
            source: "plan",
            plan_week_start: weekStart,
            is_checked: false,
          }))
        );
        if (insertError) throw insertError;
      }

      const { data: refreshed, error: refreshError } = await supabase
        .from("grocery_list")
        .select("*")
        .order("created_at", { ascending: false });
      if (refreshError) throw refreshError;
      useGroceryListStore.getState().setGroceryList(
        (refreshed || []).map((row) => ({
          id: row.id,
          name: row.name,
          nameNormalized: row.name_normalized,
          amount: Number(row.amount),
          unit: row.unit,
          category: row.category,
          isChecked: row.is_checked,
          source: row.source ?? "manual",
          planWeekStart: row.plan_week_start ?? null,
        }))
      );

      return aggregated.length;
    } catch (err) {
      const next =
        err instanceof Error
          ? err
          : new Error("Failed to build grocery list from weekly plan");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

