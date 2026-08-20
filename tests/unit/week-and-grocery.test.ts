import { describe, expect, it } from "vitest";
import { addDaysToYmd, getWeekStart, nextEmptyDinner, shiftWeekStart } from "@/lib/week";
import {
  aggregateRecipeIngredients,
  mergeCanonicalIngredients,
  shouldReplacePlanGroceryRow,
  subtractPantryStock,
} from "@/lib/grocery/aggregateIngredients";
import { canonicalizeIngredientForGroceryList } from "@/lib/grocery/canonicalize";
import type { IngredientUnitProfile } from "@/lib/grocery/unitProfiles";

describe("week-start helper", () => {
  it("returns Monday for a Wednesday in New York", () => {
    // 2026-08-19 15:00 UTC is Wednesday afternoon in New York.
    const date = new Date("2026-08-19T15:00:00.000Z");
    expect(getWeekStart(date, "America/New_York")).toBe("2026-08-17");
  });

  it("stays on the previous Monday across a late-evening timezone", () => {
    // Tuesday 01:30 UTC is still Monday evening in Los Angeles.
    const date = new Date("2026-08-18T01:30:00.000Z");
    expect(getWeekStart(date, "America/Los_Angeles")).toBe("2026-08-17");
  });

  it("uses Monday as the start when the zoned date is Sunday", () => {
    const date = new Date("2026-08-23T16:00:00.000Z");
    expect(getWeekStart(date, "America/Chicago")).toBe("2026-08-17");
  });

  it("shifts weeks by seven calendar days", () => {
    expect(shiftWeekStart("2026-08-17", 1)).toBe("2026-08-24");
    expect(shiftWeekStart("2026-08-17", -1)).toBe("2026-08-10");
    expect(addDaysToYmd("2026-08-17", 6)).toBe("2026-08-23");
  });

  it("picks the next empty dinner from today within the week", () => {
    expect(
      nextEmptyDinner(
        "2026-08-17",
        new Set(["0:dinner", "1:dinner"]),
        "2026-08-17"
      )
    ).toEqual({ dayOfWeek: 2, mealSlot: "dinner" });
    expect(
      nextEmptyDinner("2026-08-17", new Set(["3:dinner"]), "2026-08-20")
    ).toEqual({ dayOfWeek: 4, mealSlot: "dinner" });
  });
});

describe("grocery aggregation", () => {
  it("merges two carrot lines into one shop amount", () => {
    const first = canonicalizeIngredientForGroceryList({
      name: "Carrots",
      amount: 1,
      unit: "count",
      category: "Produce",
    });
    const second = canonicalizeIngredientForGroceryList({
      name: "carrot",
      amount: 3,
      unit: "count",
      category: "Produce",
    });
    expect(mergeCanonicalIngredients([first, second])).toEqual([
      expect.objectContaining({
        nameNormalized: "carrot",
        amount: 4,
        unit: "count",
      }),
    ]);
  });

  it("subtracts pantry stock from the shop list", () => {
    const lines = aggregateRecipeIngredients({
      ingredients: [
        { name: "Carrots", amount: 3, unit: "count", category: "Produce" },
      ],
      scale: 1,
      profiles: new Map(),
      pantry: [{ nameNormalized: "carrot", amount: 1, unit: "count" }],
    });
    expect(lines).toEqual([
      expect.objectContaining({ nameNormalized: "carrot", amount: 2 }),
    ]);
  });

  it("omits ingredients fully covered by the pantry", () => {
    const lines = aggregateRecipeIngredients({
      ingredients: [
        { name: "Onion", amount: 1, unit: "count", category: "Produce" },
      ],
      scale: 1,
      profiles: new Map(),
      pantry: [{ nameNormalized: "onion", amount: 2, unit: "count" }],
    });
    expect(lines).toEqual([]);
  });

  it("skips ingredients marked exclude_always", () => {
    const profiles = new Map<string, IngredientUnitProfile>([
      [
        "salt",
        {
          name_normalized: "salt",
          canonical_unit: "tsp",
          grams_per_count: null,
          ml_per_count: null,
          pack_size_amount: null,
          pack_size_unit: null,
          display_name: "Salt",
          exclude_always: true,
        },
      ],
    ]);
    const lines = aggregateRecipeIngredients({
      ingredients: [
        { name: "Salt", amount: 1, unit: "tsp", category: "Spices" },
        { name: "Pasta", amount: 200, unit: "g", category: "Pantry" },
      ],
      scale: 1,
      profiles,
    });
    expect(lines.map((line) => line.nameNormalized)).toEqual(["pasta"]);
  });

  it("keeps manual grocery rows when replacing a week's plan items", () => {
    expect(
      shouldReplacePlanGroceryRow(
        { source: "plan", planWeekStart: "2026-08-17" },
        "2026-08-17"
      )
    ).toBe(true);
    expect(
      shouldReplacePlanGroceryRow(
        { source: "manual", planWeekStart: null },
        "2026-08-17"
      )
    ).toBe(false);
    expect(
      shouldReplacePlanGroceryRow(
        { source: "plan", planWeekStart: "2026-08-10" },
        "2026-08-17"
      )
    ).toBe(false);
  });

  it("does not subtract pantry stock stored in a different unit", () => {
    const remaining = subtractPantryStock(
      [
        {
          nameNormalized: "chicken",
          displayName: "Chicken",
          amount: 1,
          unit: "lb",
          category: "Meat",
        },
      ],
      [{ nameNormalized: "chicken", amount: 8, unit: "oz" }]
    );
    expect(remaining[0]?.amount).toBe(1);
  });
});
