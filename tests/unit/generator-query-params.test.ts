import { describe, expect, it } from "vitest";
import { generatorQueryPatch } from "@/lib/generator/queryParams";

describe("generator query params", () => {
  it("leaves the wizard defaults alone when the URL has no recognized params", () => {
    expect(
      generatorQueryPatch({ mode: null, ingredients: null, meal: null })
    ).toBeNull();
  });

  it("opens pantry mode from a pantry flag or an ingredients list", () => {
    expect(
      generatorQueryPatch({
        mode: "pantry",
        ingredients: null,
        meal: null,
      })
    ).toEqual({ mode: "pantry" });

    expect(
      generatorQueryPatch({
        mode: null,
        ingredients: "eggs, rice",
        meal: null,
      })
    ).toEqual({ mode: "pantry", ingredientsInput: "eggs, rice" });
  });

  it("applies a known meal without switching the wizard into pantry mode", () => {
    expect(
      generatorQueryPatch({
        mode: "classic",
        ingredients: null,
        meal: "Dinner",
      })
    ).toEqual({ meal: "Dinner" });
  });

  it("ignores a meal value the wizard does not offer", () => {
    expect(
      generatorQueryPatch({
        mode: null,
        ingredients: null,
        meal: "Brunch",
      })
    ).toEqual({});
  });
});
