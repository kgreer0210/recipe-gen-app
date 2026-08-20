import type { Unit } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IngredientUnitProfile = {
  name_normalized: string;
  canonical_unit: Unit;
  grams_per_count: number | null;
  ml_per_count: number | null;
  pack_size_amount: number | null;
  pack_size_unit: Unit | null;
  display_name: string | null;
  exclude_always?: boolean;
  pantry_staple?: boolean;
  buy_unit_label?: string | null;
};

export async function fetchUnitProfiles(
  supabase: SupabaseClient,
  normalizedNames: string[]
): Promise<Map<string, IngredientUnitProfile>> {
  const unique = Array.from(new Set(normalizedNames)).filter(
    (name) => name.length > 0
  );
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("ingredient_unit_profiles")
    .select(
      "name_normalized, canonical_unit, grams_per_count, ml_per_count, pack_size_amount, pack_size_unit, display_name, exclude_always, pantry_staple, buy_unit_label"
    )
    .in("name_normalized", unique);

  if (error) {
    console.warn("Failed to fetch ingredient unit profiles:", error);
    return new Map();
  }

  const map = new Map<string, IngredientUnitProfile>();
  for (const row of data || []) {
    map.set(row.name_normalized, row as IngredientUnitProfile);
  }
  return map;
}

