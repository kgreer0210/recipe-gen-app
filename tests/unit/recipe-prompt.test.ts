import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter/chatJson", () => ({ chatJson: vi.fn() }));

import { buildRecipePrompts, type RecipeGenerationInput } from "@/lib/recipe/generateRecipe";

/** The Busy week classic input with no protein: the model chooses it, as it did before Protein existed. */
const busyWeekAny: RecipeGenerationInput = {
  mode: "classic",
  cuisine: "Thai",
  meal: "Dinner",
  dietaryPreferences: ["Gluten-Free"],
  dislikedIngredients: ["cilantro"],
  servings: 2,
};

const pantry: RecipeGenerationInput = {
  mode: "pantry",
  ingredients: ["eggs", "spinach", "feta"],
  dietaryPreferences: [],
  dislikedIngredients: [],
  servings: 2,
};

function promptFor(input: RecipeGenerationInput): string {
  return buildRecipePrompts(input).prompt;
}

describe("recipe prompt: protein", () => {
  it("is byte-identical for Busy week when the protein is Any or missing", () => {
    expect(promptFor({ ...busyWeekAny, protein: "Any" })).toBe(promptFor(busyWeekAny));
    expect(promptFor(busyWeekAny)).toMatchSnapshot();
  });

  it("is byte-identical for pantry when the protein is Any or missing", () => {
    expect(promptFor({ ...pantry, protein: "Any" })).toBe(promptFor(pantry));
    expect(promptFor(pantry)).toMatchSnapshot();
  });

  it("uses a chosen protein as the base, with the exact tag rule", () => {
    const prompt = promptFor({ ...busyWeekAny, protein: "Beef" });

    expect(prompt).toContain("Protein (base): Beef");
    expect(prompt).toContain("tags must exactly match (Thai, Dinner, Beef).");
    expect(prompt).toContain("Explore the full spectrum of Thai cuisine for Beef dishes.");
    expect(prompt).not.toContain("Chef's choice");
  });

  it("keeps the ProteinType wording for a protein that is also a ProteinType", () => {
    const prompt = promptFor({ ...busyWeekAny, protein: "Beans" });

    expect(prompt).toContain("Protein (base): Beans");
    expect(prompt).toContain("tags must exactly match (Thai, Dinner, Beans).");
  });

  it.each([
    ["Shrimp/Seafood", "Protein (base): shrimp or other seafood"],
    ["Beans/Legumes", "Protein (base): beans or legumes"],
    ["Vegetarian (no meat)", "Protein (base): vegetarian"],
  ] as const)("reads %s as %s and asks the model to name the base protein in tags", (choice, line) => {
    const prompt = promptFor({ ...busyWeekAny, protein: choice });

    expect(prompt).toContain(line);
    expect(prompt).toContain("tags.protein must name the base protein you chose.");
    expect(prompt).not.toContain("tags must exactly match");
  });

  it("asks for a dish with no meat, poultry or fish when the choice is Vegetarian", () => {
    expect(promptFor({ ...busyWeekAny, protein: "Vegetarian (no meat)" })).toContain(
      "- This must be a vegetarian dish with no meat, poultry or fish."
    );
    expect(promptFor({ ...busyWeekAny, protein: "Tofu" })).not.toContain("no meat, poultry or fish");
  });

  it("names the chosen protein in the pantry prompt", () => {
    const prompt = promptFor({ ...pantry, protein: "Pork" });

    expect(prompt).toContain("- Protein preference: Pork.");
    expect(prompt).not.toContain("Protein (base)");
  });

  it("adds the vegetarian rule to the pantry prompt too", () => {
    const prompt = promptFor({ ...pantry, protein: "Vegetarian (no meat)" });

    expect(prompt).toContain("- Protein preference: vegetarian.");
    expect(prompt).toContain("- This must be a vegetarian dish with no meat, poultry or fish.");
  });

  it("throws for an unknown pantry protein, so it can never reach the prompt", () => {
    expect(() => promptFor({ ...pantry, protein: "Dragon" as never })).toThrow("Unknown protein: Dragon");
  });
});
