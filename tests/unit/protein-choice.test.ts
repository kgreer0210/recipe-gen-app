import { describe, expect, it } from "vitest";
import {
  disabledProteinChoices,
  proteinConflict,
  proteinConflictNote,
} from "@/lib/proteinChoice";
import { validateBusyWeekRequest } from "@/lib/busyWeek";
import { PROTEIN_CHOICES } from "@/types";

const BATCH = "3f0c9c2e-6a1e-4c7e-9a55-1f2b3c4d5e6f";
const MEAT = ["Chicken", "Beef", "Pork", "Turkey", "Fish", "Shrimp/Seafood"];

describe("protein choices", () => {
  it("lists the choices in the order the picker shows them", () => {
    expect(PROTEIN_CHOICES).toEqual([
      "Any",
      "Chicken",
      "Beef",
      "Pork",
      "Turkey",
      "Fish",
      "Shrimp/Seafood",
      "Tofu",
      "Beans/Legumes",
      "Eggs",
      "Vegetarian (no meat)",
    ]);
  });

  it("rules out meat and fish for a saved vegetarian, whatever the case", () => {
    for (const choice of MEAT) {
      expect(proteinConflict(choice as never, ["VEGETARIAN"])).toBe("vegetarian");
    }
    expect(proteinConflict("Eggs", ["vegetarian"])).toBeNull();
    expect(proteinConflict("Tofu", ["vegetarian"])).toBeNull();
    expect(proteinConflict("Beans/Legumes", ["vegetarian"])).toBeNull();
    expect(proteinConflict("Vegetarian (no meat)", ["vegetarian"])).toBeNull();
  });

  it("also rules out eggs for a saved vegan", () => {
    for (const choice of [...MEAT, "Eggs"]) {
      expect(proteinConflict(choice as never, [" Vegan "])).toBe("vegan");
    }
    expect(proteinConflict("Tofu", ["vegan"])).toBeNull();
  });

  it("allows everything when there is no vegetarian or vegan preference, or the choice is Any", () => {
    expect(proteinConflict("Beef", [])).toBeNull();
    expect(proteinConflict("Beef", ["Gluten-Free", "Dairy-Free"])).toBeNull();
    expect(proteinConflict("Any", ["vegan"])).toBeNull();
    expect(proteinConflict(undefined, ["vegan"])).toBeNull();
  });

  it("does not read a negated preference as vegetarian", () => {
    expect(proteinConflict("Beef", ["Non-vegetarian"])).toBeNull();
  });

  it("lists every choice the preferences rule out, and none when nothing conflicts", () => {
    expect([...disabledProteinChoices(["vegetarian"])].sort()).toEqual([...MEAT].sort());
    expect([...disabledProteinChoices(["vegan"])].sort()).toEqual([...MEAT, "Eggs"].sort());
    expect(disabledProteinChoices(["Dairy-Free"]).size).toBe(0);
  });

  it("explains the conflict in the Settings note, and says nothing without one", () => {
    expect(proteinConflictNote(["vegetarian"])).toBe("Your Settings say vegetarian. Change it in Settings to pick meat.");
    expect(proteinConflictNote(["vegan"])).toBe("Your Settings say vegan. Change it in Settings to pick meat or eggs.");
    expect(proteinConflictNote(["Dairy-Free"])).toBeNull();
  });
});

describe("busy week protein validation", () => {
  const body = (pick: Record<string, unknown>) => ({
    batchId: BATCH,
    weekStart: "2026-10-26",
    picks: [{ cuisine: "Thai", dayOfWeek: 0, ...pick }],
  });

  it("rejects a protein outside the list", () => {
    const result = validateBusyWeekRequest(body({ protein: "Dragon" }));

    expect(result).toEqual({ ok: false, error: "Unknown protein." });
  });

  it("defaults a missing protein to Any and keeps a chosen one", () => {
    const missing = validateBusyWeekRequest(body({}));
    const chosen = validateBusyWeekRequest(body({ protein: "Tofu" }));

    expect(missing.ok && missing.value.picks[0].protein).toBe("Any");
    expect(chosen.ok && chosen.value.picks[0].protein).toBe("Tofu");
  });
});
