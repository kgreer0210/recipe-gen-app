import type { Ingredient, PantryItem, Unit } from "@/types";
import {
  canonicalizeIngredientForGroceryList,
  type CanonicalizedIngredient,
} from "@/lib/grocery/canonicalize";
import { normalizeIngredientName } from "@/lib/grocery/normalize";
import type { IngredientUnitProfile } from "@/lib/grocery/unitProfiles";

export type AggregatedIngredient = {
  nameNormalized: string;
  displayName: string;
  amount: number;
  unit: Unit;
  category: string;
};

export type PantryStock = Pick<PantryItem, "nameNormalized" | "amount" | "unit">;

const MERGE_EPSILON = 0.01;

function mergeKey(nameNormalized: string, unit: Unit): string {
  return `${nameNormalized}::${unit}`;
}

export function ingredientsToCanonicalLines(
  ingredients: Array<Pick<Ingredient, "name" | "amount" | "unit" | "category">>,
  scale: number,
  profiles: Map<string, IngredientUnitProfile>
): CanonicalizedIngredient[] {
  const lines: CanonicalizedIngredient[] = [];
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  for (const ingredient of ingredients) {
    const nameNorm = normalizeIngredientName(ingredient.name);
    const profile = profiles.get(nameNorm);
    if (profile?.exclude_always) {
      continue;
    }
    const canonical = canonicalizeIngredientForGroceryList(ingredient, profile);
    lines.push({
      ...canonical,
      amount: canonical.amount * safeScale,
    });
  }

  return lines;
}

export function mergeCanonicalIngredients(
  items: CanonicalizedIngredient[]
): AggregatedIngredient[] {
  const merged = new Map<string, AggregatedIngredient>();

  for (const item of items) {
    const key = mergeKey(item.nameNormalized, item.unit);
    const existing = merged.get(key);
    if (existing) {
      existing.amount += item.amount;
    } else {
      merged.set(key, {
        nameNormalized: item.nameNormalized,
        displayName: item.displayName,
        amount: item.amount,
        unit: item.unit,
        category: item.category,
      });
    }
  }

  return Array.from(merged.values());
}

export function subtractPantryStock(
  items: AggregatedIngredient[],
  pantry: PantryStock[]
): AggregatedIngredient[] {
  const remaining = items.map((item) => ({ ...item }));
  const pantryByKey = new Map<string, number>();
  for (const stock of pantry) {
    const key = mergeKey(stock.nameNormalized, stock.unit);
    pantryByKey.set(key, (pantryByKey.get(key) ?? 0) + stock.amount);
  }

  return remaining
    .map((item) => {
      const key = mergeKey(item.nameNormalized, item.unit);
      const inPantry = pantryByKey.get(key) ?? 0;
      return { ...item, amount: item.amount - inPantry };
    })
    .filter((item) => item.amount > MERGE_EPSILON);
}

export function aggregateRecipeIngredients(options: {
  ingredients: Array<Pick<Ingredient, "name" | "amount" | "unit" | "category">>;
  scale: number;
  profiles: Map<string, IngredientUnitProfile>;
  pantry?: PantryStock[];
}): AggregatedIngredient[] {
  const canonical = ingredientsToCanonicalLines(
    options.ingredients,
    options.scale,
    options.profiles
  );
  const merged = mergeCanonicalIngredients(canonical);
  if (!options.pantry || options.pantry.length === 0) {
    return merged;
  }
  return subtractPantryStock(merged, options.pantry);
}

export function shouldReplacePlanGroceryRow(
  row: { source?: string | null; planWeekStart?: string | null },
  weekStart: string
): boolean {
  return row.source === "plan" && row.planWeekStart === weekStart;
}
