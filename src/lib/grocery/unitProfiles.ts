import type { Unit } from "@/types";

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

