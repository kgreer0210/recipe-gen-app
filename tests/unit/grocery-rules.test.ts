import { describe, expect, it } from "vitest";
import { normalizeIngredientName } from "@/lib/grocery/normalize";
import { canonicalizeIngredientForGroceryList } from "@/lib/grocery/canonicalize";
import { getPurchaseQuantity } from "@/lib/grocery/purchase";
import { formatRecipeAmount } from "@/lib/grocery/format";
import type { IngredientUnitProfile } from "@/lib/grocery/unitProfiles";

describe("ingredient-name rules", () => {
  it.each([
    ["  Diced Onions, ", "onion"],
    ["fresh garlic", "garlic"],
    ["CARROTS (chopped)", "carrot"],
    ["glass", "glass"],
  ])("turns %j into the shared grocery name %j", (input, expected) => {
    expect(normalizeIngredientName(input)).toBe(expected);
  });
});

describe("ingredient measurement rules", () => {
  it("combines metric weights as grams", () => {
    expect(
      canonicalizeIngredientForGroceryList({
        name: "Flour",
        amount: 1.25,
        unit: "kg",
        category: "Pantry",
      })
    ).toMatchObject({ amount: 1250, unit: "g", nameNormalized: "flour" });
  });

  it("combines metric liquids as milliliters", () => {
    expect(
      canonicalizeIngredientForGroceryList({
        name: "Stock",
        amount: 1.5,
        unit: "l",
        category: "Pantry",
      })
    ).toMatchObject({ amount: 1500, unit: "ml" });
  });

  it("combines meat sold in ounces and pounds as pounds", () => {
    expect(
      canonicalizeIngredientForGroceryList({
        name: "Chicken",
        amount: 8,
        unit: "oz",
        category: "Meat",
      })
    ).toMatchObject({ amount: 0.5, unit: "lb" });
  });

  it("uses an ingredient profile's preferred unit", () => {
    const profile = {
      name_normalized: "beef",
      canonical_unit: "lb",
      display_name: "Ground beef",
    } as IngredientUnitProfile;

    expect(
      canonicalizeIngredientForGroceryList(
        { name: "Beef", amount: 453.59237, unit: "g", category: "Meat" },
        profile
      )
    ).toMatchObject({ amount: 1, unit: "lb", displayName: "Ground beef" });
  });

  it("turns weight into a count when the database has an estimate", () => {
    const profile = {
      name_normalized: "apple",
      canonical_unit: "count",
      grams_per_count: 200,
    } as IngredientUnitProfile;

    expect(
      canonicalizeIngredientForGroceryList(
        { name: "Apples", amount: 600, unit: "g", category: "Produce" },
        profile
      )
    ).toMatchObject({ amount: 3, unit: "count" });
  });

  it("keeps an incompatible measurement instead of guessing", () => {
    const profile = {
      name_normalized: "garlic",
      canonical_unit: "clove",
    } as IngredientUnitProfile;

    expect(
      canonicalizeIngredientForGroceryList(
        { name: "Garlic", amount: 2, unit: "tbsp", category: "Produce" },
        profile
      )
    ).toMatchObject({ amount: 2, unit: "tbsp" });
  });
});

describe("shopping-quantity rules", () => {
  it.each([
    [8, "oz" as const, 1],
    [1.2, "lb" as const, 2],
  ])("rounds %s %s of meat to %s purchasable pound(s)", (amount, unit, expected) => {
    expect(
      getPurchaseQuantity({ name: "Chicken", amount, unit, category: "Meat" })
    ).toMatchObject({ buyAmount: expected, buyUnit: "lb" });
  });

  it("rounds countable items up to a whole item", () => {
    expect(
      getPurchaseQuantity({ name: "Lemon", amount: 1.2, unit: "count", category: "Produce" })
    ).toMatchObject({ buyAmount: 2, buyUnit: "count" });
  });

  it("uses package sizes when the database provides them", () => {
    const profile = {
      name_normalized: "stock",
      canonical_unit: "ml",
      pack_size_amount: 500,
      pack_size_unit: "ml",
      buy_unit_label: "bottles",
    } as IngredientUnitProfile;

    expect(
      getPurchaseQuantity(
        { name: "Stock", amount: 750, unit: "ml", category: "Pantry" },
        profile
      )
    ).toMatchObject({ buyAmount: 2, buyUnit: "bottles", reason: "Common package size" });
  });

  it("never recommends a negative purchase", () => {
    expect(
      getPurchaseQuantity({ name: "Salt", amount: -2, unit: "tsp", category: "Spices" })
    ).toMatchObject({ buyAmount: 0 });
  });
});

describe("recipe-display rules", () => {
  it.each([
    [1.5, "cup" as const, "1 1/2"],
    [0.333, "tsp" as const, "1/3"],
    [1.2, "lb" as const, "1.2"],
    [Number.POSITIVE_INFINITY, "g" as const, "0"],
  ])("formats %s %s as %s", (amount, unit, expected) => {
    expect(formatRecipeAmount(amount, unit)).toBe(expected);
  });
});
