import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter/chatJson", () => ({ chatJson: vi.fn() }));

import { DIETARY_PREFERENCES_LIST, MAX_DIETARY_PREFERENCES } from "@/types";
import { dietaryGuidanceBlock } from "@/lib/recipe/dietaryGuidance";
import { buildRecipePrompts, type RecipeGenerationInput } from "@/lib/recipe/generateRecipe";

const classic: RecipeGenerationInput = {
  mode: "classic",
  cuisine: "Thai",
  meal: "Dinner",
  protein: "Chicken",
  dietaryPreferences: [],
  dislikedIngredients: [],
  servings: 2,
};

const pantry: RecipeGenerationInput = {
  mode: "pantry",
  ingredients: ["eggs", "spinach", "feta"],
  dietaryPreferences: [],
  dislikedIngredients: [],
  servings: 2,
};

const GUIDANCE_MARKERS = [
  "lean protein in every serving",
  "good fiber from vegetables, legumes or whole grains",
  "smaller and nutrient-dense",
  "avoid greasy, deep-fried and very rich or heavy dishes",
  "Keep added sugar low and limit refined carbs",
  "easy-to-digest preparations",
  "hydrating components",
];

function promptFor(input: RecipeGenerationInput): string {
  return buildRecipePrompts(input).prompt;
}

describe("GLP-1 dietary option", () => {
  it("is in the dietary preferences list", () => {
    expect(DIETARY_PREFERENCES_LIST).toContain("GLP-1");
  });

  it("fits under the dietary preferences cap together with every other option", () => {
    expect(MAX_DIETARY_PREFERENCES).toBeGreaterThanOrEqual(DIETARY_PREFERENCES_LIST.length);
  });
});

describe("dietaryGuidanceBlock", () => {
  it("is empty when no preference has guidance", () => {
    expect(dietaryGuidanceBlock([])).toBe("");
    expect(dietaryGuidanceBlock(["Vegan", "Keto"])).toBe("");
  });

  it("matches the whole name case-insensitively", () => {
    const expected = dietaryGuidanceBlock(["GLP-1"]);
    expect(expected).not.toBe("");
    expect(dietaryGuidanceBlock(["glp-1"])).toBe(expected);
    expect(dietaryGuidanceBlock(["  Glp-1 "])).toBe(expected);
    expect(dietaryGuidanceBlock(["GLP-1 friendly"])).toBe("");
    expect(dietaryGuidanceBlock(["GLP"])).toBe("");
  });

  it("does not repeat guidance for duplicate spellings", () => {
    expect(dietaryGuidanceBlock(["GLP-1", "glp-1"])).toBe(dietaryGuidanceBlock(["GLP-1"]));
  });

  it("makes no medical claims", () => {
    const text = dietaryGuidanceBlock(["GLP-1"]).toLowerCase();
    for (const word of ["treat", "cure", "medication", "blood sugar", "lose weight", "weight loss", "diabetes"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("recipe prompt: GLP-1", () => {
  it.each([
    ["selection", classic],
    ["pantry", pantry],
  ])("includes the guidance in %s mode, after the STRICTLY ADHERE line", (_name, base) => {
    const prompt = promptFor({ ...base, dietaryPreferences: ["Gluten-Free", "GLP-1"] });
    expect(prompt).toContain("- STRICTLY ADHERE to these dietary preferences: Gluten-Free, GLP-1.");
    for (const marker of GUIDANCE_MARKERS) expect(prompt).toContain(marker);
    expect(prompt.indexOf("STRICTLY ADHERE")).toBeLessThan(prompt.indexOf(GUIDANCE_MARKERS[0]));
  });

  it.each([
    ["selection", classic],
    ["pantry", pantry],
  ])("leaves the %s prompt unchanged when GLP-1 is absent", (_name, base) => {
    const prompt = promptFor({ ...base, dietaryPreferences: ["Gluten-Free"] });
    for (const marker of GUIDANCE_MARKERS) expect(prompt).not.toContain(marker);
  });

  it("is case-insensitive in the prompt builder", () => {
    const prompt = promptFor({ ...classic, dietaryPreferences: ["glp-1"] });
    for (const marker of GUIDANCE_MARKERS) expect(prompt).toContain(marker);
  });
});
