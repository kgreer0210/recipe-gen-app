import { PROTEIN_CHOICES, type ProteinChoice } from "@/types";

/** Choices that are meat, poultry, fish or seafood. */
const MEAT_CHOICES: ReadonlySet<ProteinChoice> = new Set<ProteinChoice>([
  "Chicken",
  "Beef",
  "Pork",
  "Turkey",
  "Fish",
  "Shrimp/Seafood",
]);

export type ConflictingDiet = "vegetarian" | "vegan";

/**
 * The saved dietary preference that rules a protein out, or null when it is allowed.
 * Vegetarian rules out meat and fish. Vegan also rules out eggs. Matching is
 * case-insensitive on the whole preference name, so "Non-vegetarian" does not count.
 */
export function proteinConflict(
  protein: ProteinChoice | undefined,
  dietaryPreferences: readonly string[]
): ConflictingDiet | null {
  if (!protein || protein === "Any") return null;
  const names = new Set(dietaryPreferences.map((pref) => pref.trim().toLowerCase()));
  const isMeat = MEAT_CHOICES.has(protein);
  if (names.has("vegan") && (isMeat || protein === "Eggs")) return "vegan";
  if (names.has("vegetarian") && isMeat) return "vegetarian";
  return null;
}

/** Every protein choice the saved preferences rule out. Empty when nothing conflicts. */
export function disabledProteinChoices(dietaryPreferences: readonly string[]): Set<ProteinChoice> {
  return new Set(PROTEIN_CHOICES.filter((choice) => proteinConflict(choice, dietaryPreferences) !== null));
}

/** Short, user-facing reason for the note under the Protein select. Null when there is no conflict. */
export function proteinConflictNote(dietaryPreferences: readonly string[]): string | null {
  const diets = (["vegetarian", "vegan"] as const).filter((diet) =>
    PROTEIN_CHOICES.some((choice) => proteinConflict(choice, dietaryPreferences) === diet)
  );
  const diet = diets.includes("vegetarian") ? "vegetarian" : diets[0];
  if (!diet) return null;
  const rules = diet === "vegan" ? "meat or eggs" : "meat";
  return `Your Settings say ${diet}. Change it in Settings to pick ${rules}.`;
}

/** Server message for a pick whose protein the saved preferences rule out. */
export function proteinConflictMessage(protein: ProteinChoice, diet: ConflictingDiet): string {
  return `Your saved dietary preferences say ${diet}, so ${protein} is not allowed. Change them in Settings or pick another protein.`;
}
