export function normalizeIngredientName(name: string): string {
  let base = name
    .toLowerCase()
    .trim()
    // drop punctuation that often varies across model outputs
    .replace(/[(){}[\],.]/g, " ")
    .replace(/\s+/g, " ");

  // Strip common preparation methods to ensure ingredients aggregate correctly
  // e.g., "garlic minced" -> "garlic", "onion diced" -> "onion"
  const preparationTerms = [
    "minced",
    "diced",
    "chopped",
    "sliced",
    "crushed",
    "julienned",
    "grated",
    "shredded",
    "peeled",
    "cubed",
    "halved",
    "quartered",
    "whole",
    "trimmed",
    "boneless",
    "skinless",
    "fresh",
    "frozen",
    "canned",
    "dried",
    "cooked",
    "raw",
    "uncooked",
  ];

  // Remove preparation terms from the end or middle of ingredient names
  preparationTerms.forEach((term) => {
    // Remove if at the end: "garlic minced" -> "garlic"
    const endPattern = new RegExp(`\\s+${term}\\s*$`, "gi");
    base = base.replace(endPattern, " ");
    
    // Remove if in the middle: "minced garlic" -> "garlic"
    const startPattern = new RegExp(`^${term}\\s+`, "gi");
    base = base.replace(startPattern, " ");
    
    // Remove if standalone: "garlic minced fresh" -> "garlic"
    const middlePattern = new RegExp(`\\s+${term}\\s+`, "gi");
    base = base.replace(middlePattern, " ");
  });

  // Clean up any extra whitespace created by removals
  base = base.replace(/\s+/g, " ").trim();

  // Very small plural handling for common grocery items:
  // carrots -> carrot, onions -> onion, lemons -> lemon
  // Avoid stripping for words like "glass" (ends with ss).
  if (base.length > 3 && base.endsWith("s") && !base.endsWith("ss")) {
    return base.slice(0, -1);
  }

  return base;
}

