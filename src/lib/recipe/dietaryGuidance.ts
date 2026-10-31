/**
 * Extra cooking guidance for dietary preferences that need more than a name.
 * Keys are lower-case; lookup is a whole-name, case-insensitive match.
 * Guidance is cooking direction only, never a health or medical claim.
 */
const DIETARY_GUIDANCE: ReadonlyMap<string, readonly string[]> = new Map([
  [
    "glp-1",
    [
      "Make it protein-forward: include a lean protein in every serving.",
      "Include good fiber from vegetables, legumes or whole grains.",
      "Keep portions per serving smaller and nutrient-dense.",
      "Keep fat lower: avoid greasy, deep-fried and very rich or heavy dishes.",
      "Keep added sugar low and limit refined carbs.",
      "Use gentle, easy-to-digest preparations (steaming, poaching, baking, light sautéing) and avoid very spicy or heavy sauces by default.",
      "Include hydrating components such as soups, brothy dishes or water-rich vegetables where they fit.",
    ],
  ],
]);

/** Prompt bullet lines (each starting with "\n      - ") for the preferences that have guidance, or "" if none. */
export function dietaryGuidanceBlock(preferences: readonly string[]): string {
  const seen = new Set<string>();
  let block = "";
  for (const pref of preferences) {
    const key = pref.trim().toLowerCase();
    const lines = DIETARY_GUIDANCE.get(key);
    if (!lines || seen.has(key)) continue;
    seen.add(key);
    for (const line of lines) block += `\n      - ${line}`;
  }
  return block;
}
