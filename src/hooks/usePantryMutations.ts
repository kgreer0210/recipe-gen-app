import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { transformPantryRow } from "@/hooks/usePantryRealtime";
import { usePantryStore } from "@/lib/stores/pantryStore";
import { normalizeIngredientName } from "@/lib/grocery/normalize";
import { canonicalizeIngredientForGroceryList } from "@/lib/grocery/canonicalize";
import { fetchUnitProfiles } from "@/lib/grocery/unitProfiles";
import type { PantryItem, PantrySource, Unit } from "@/types";

export function useUpsertPantryItem() {
  const { supabase, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (item: {
    name: string;
    amount: number;
    unit: Unit;
    category?: string;
    source?: PantrySource;
  }): Promise<PantryItem | null> => {
    if (!user) throw new Error("User not authenticated");
    setIsLoading(true);
    setError(null);

    try {
      const nameNorm = normalizeIngredientName(item.name);
      const profiles = await fetchUnitProfiles(supabase, [nameNorm]);
      const profile = profiles.get(nameNorm);
      if (profile?.exclude_always) {
        return null;
      }
      const canonical = canonicalizeIngredientForGroceryList(item, profile);
      const source = item.source ?? "manual";

      const { data: existing, error: fetchError } = await supabase
        .from("pantry_items")
        .select("id, name, name_normalized, amount, unit, category, source")
        .eq("user_id", user.id)
        .eq("name_normalized", canonical.nameNormalized)
        .eq("unit", canonical.unit)
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (existing) {
        const nextAmount = Number(existing.amount) + canonical.amount;
        const { data, error: updateError } = await supabase
          .from("pantry_items")
          .update({
            amount: nextAmount,
            name: canonical.displayName,
            category: canonical.category || existing.category,
            source,
          })
          .eq("id", existing.id)
          .select("id, name, name_normalized, amount, unit, category, source")
          .single();
        if (updateError) throw updateError;
        const transformed = transformPantryRow(data);
        usePantryStore.getState().updateItem(transformed);
        return transformed;
      }

      const { data, error: insertError } = await supabase
        .from("pantry_items")
        .insert({
          user_id: user.id,
          name: canonical.displayName,
          name_normalized: canonical.nameNormalized,
          amount: canonical.amount,
          unit: canonical.unit,
          category: canonical.category || "Other",
          source,
        })
        .select("id, name, name_normalized, amount, unit, category, source")
        .single();
      if (insertError) throw insertError;
      const transformed = transformPantryRow(data);
      usePantryStore.getState().addItem(transformed);
      return transformed;
    } catch (err) {
      const next =
        err instanceof Error ? err : new Error("Failed to update pantry");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useUpdatePantryAmount() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (itemId: string, amount: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const nextAmount = Math.max(0, amount);
      if (nextAmount <= 0.01) {
        const { error: deleteError } = await supabase
          .from("pantry_items")
          .delete()
          .eq("id", itemId);
        if (deleteError) throw deleteError;
        usePantryStore.getState().removeItem(itemId);
        return;
      }
      const { error: updateError } = await supabase
        .from("pantry_items")
        .update({ amount: nextAmount })
        .eq("id", itemId);
      if (updateError) throw updateError;
    } catch (err) {
      const next =
        err instanceof Error ? err : new Error("Failed to update pantry amount");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}

export function useRemovePantryItem() {
  const { supabase } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutateAsync = async (itemId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("pantry_items")
        .delete()
        .eq("id", itemId);
      if (deleteError) throw deleteError;
      usePantryStore.getState().removeItem(itemId);
    } catch (err) {
      const next =
        err instanceof Error ? err : new Error("Failed to remove pantry item");
      setError(next);
      throw next;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutateAsync, isLoading, error };
}
