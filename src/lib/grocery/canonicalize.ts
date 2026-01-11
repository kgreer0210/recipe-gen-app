import type { Ingredient, Unit } from "@/types";
import type { IngredientUnitProfile } from "@/lib/grocery/unitProfiles";
import { normalizeIngredientName } from "@/lib/grocery/normalize";

function toGrams(amount: number, unit: Unit): number | null {
  if (!Number.isFinite(amount)) return null;
  if (unit === "g") return amount;
  if (unit === "kg") return amount * 1000;
  if (unit === "oz") return amount * 28.349523125;
  if (unit === "lb") return amount * 453.59237;
  return null;
}

function fromGrams(grams: number, unit: Unit): number | null {
  if (!Number.isFinite(grams)) return null;
  if (unit === "g") return grams;
  if (unit === "kg") return grams / 1000;
  if (unit === "oz") return grams / 28.349523125;
  if (unit === "lb") return grams / 453.59237;
  return null;
}

function toMl(amount: number, unit: Unit): number | null {
  if (!Number.isFinite(amount)) return null;
  if (unit === "ml") return amount;
  if (unit === "l") return amount * 1000;
  return null;
}

function fromMl(ml: number, unit: Unit): number | null {
  if (!Number.isFinite(ml)) return null;
  if (unit === "ml") return ml;
  if (unit === "l") return ml / 1000;
  return null;
}

export type CanonicalizedIngredient = {
  nameNormalized: string;
  displayName: string;
  amount: number;
  unit: Unit;
  category: string;
};

export function canonicalizeIngredientForGroceryList(
  ingredient: Pick<Ingredient, "name" | "amount" | "unit" | "category">,
  profile?: IngredientUnitProfile
): CanonicalizedIngredient {
  const nameNormalized = normalizeIngredientName(ingredient.name);
  const category = ingredient.category || "Other";

  const canonicalUnit = profile?.canonical_unit;
  const displayName = profile?.display_name || ingredient.name;

  // If we have no profile, only do safe conversions within known compatible groups.
  if (!canonicalUnit) {
    // Meat: normalize oz/lb to lb to avoid unit splits.
    if (
      category.toLowerCase() === "meat" &&
      (ingredient.unit === "oz" || ingredient.unit === "lb")
    ) {
      const grams = toGrams(ingredient.amount, ingredient.unit);
      const lb =
        grams === null
          ? ingredient.amount
          : fromGrams(grams, "lb") ?? ingredient.amount;
      return { nameNormalized, displayName, amount: lb, unit: "lb", category };
    }

    // Liquids: normalize l/ml to ml.
    if (ingredient.unit === "l" || ingredient.unit === "ml") {
      const ml = toMl(ingredient.amount, ingredient.unit) ?? ingredient.amount;
      return { nameNormalized, displayName, amount: ml, unit: "ml", category };
    }

    // Metric weights: normalize kg/g to g.
    if (ingredient.unit === "kg" || ingredient.unit === "g") {
      const grams =
        toGrams(ingredient.amount, ingredient.unit) ?? ingredient.amount;
      return {
        nameNormalized,
        displayName,
        amount: grams,
        unit: "g",
        category,
      };
    }

    return {
      nameNormalized,
      displayName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      category,
    };
  }

  // With profile: convert into canonical unit when possible.
  if (canonicalUnit === ingredient.unit) {
    return {
      nameNormalized,
      displayName,
      amount: ingredient.amount,
      unit: canonicalUnit,
      category,
    };
  }

  // count canonical: convert from weight when we have an estimate.
  if (canonicalUnit === "count" && profile?.grams_per_count) {
    const grams = toGrams(ingredient.amount, ingredient.unit);
    if (grams !== null) {
      const count = grams / profile.grams_per_count;
      return {
        nameNormalized,
        displayName,
        amount: count,
        unit: "count",
        category,
      };
    }
  }

  // clove canonical: no conversion (requires domain logic); fall back to original unit.
  if (canonicalUnit === "clove") {
    return {
      nameNormalized,
      displayName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      category,
    };
  }

  // lb/oz/g/kg canonical: convert via grams.
  if (
    (canonicalUnit === "lb" ||
      canonicalUnit === "oz" ||
      canonicalUnit === "g" ||
      canonicalUnit === "kg") &&
    (ingredient.unit === "lb" ||
      ingredient.unit === "oz" ||
      ingredient.unit === "g" ||
      ingredient.unit === "kg")
  ) {
    const grams = toGrams(ingredient.amount, ingredient.unit);
    const converted = grams === null ? null : fromGrams(grams, canonicalUnit);
    if (converted !== null) {
      return {
        nameNormalized,
        displayName,
        amount: converted,
        unit: canonicalUnit,
        category,
      };
    }
  }

  // ml/l canonical: convert via ml.
  if (
    (canonicalUnit === "ml" || canonicalUnit === "l") &&
    (ingredient.unit === "ml" || ingredient.unit === "l")
  ) {
    const ml = toMl(ingredient.amount, ingredient.unit);
    const converted = ml === null ? null : fromMl(ml, canonicalUnit);
    if (converted !== null) {
      return {
        nameNormalized,
        displayName,
        amount: converted,
        unit: canonicalUnit,
        category,
      };
    }
  }

  // Otherwise, keep original.
  return {
    nameNormalized,
    displayName,
    amount: ingredient.amount,
    unit: ingredient.unit,
    category,
  };
}
