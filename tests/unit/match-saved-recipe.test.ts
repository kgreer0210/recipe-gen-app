import { describe, expect, it } from "vitest";
import { matchSavedRecipe } from "@/lib/recipe/matchSavedRecipe";

const chili = { id: "chili", title: "Chili", servings: 4 };
const soup = { id: "soup", title: "Soup", servings: 2 };

describe("matchSavedRecipe", () => {
  it("waits while the saved collection is still empty", () => {
    expect(matchSavedRecipe([], "chili")).toBeNull();
  });

  it("keeps the current recipe when this id is not in a loaded collection", () => {
    expect(matchSavedRecipe([soup], "chili")).toBeNull();
  });

  it("returns the matching recipe and its servings", () => {
    expect(matchSavedRecipe([soup, chili], "chili")).toEqual({
      recipe: chili,
      servings: 4,
    });
  });

  it("falls back to one serving when the stored count is missing or not positive", () => {
    expect(
      matchSavedRecipe([{ id: "toast", title: "Toast" }], "toast")
    ).toEqual({
      recipe: { id: "toast", title: "Toast" },
      servings: 1,
    });
    expect(
      matchSavedRecipe([{ id: "toast", title: "Toast", servings: 0 }], "toast")
    ).toEqual({
      recipe: { id: "toast", title: "Toast", servings: 0 },
      servings: 1,
    });
  });
});
