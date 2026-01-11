export function normalizeIngredientName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    // drop punctuation that often varies across model outputs
    .replace(/[(){}[\],.]/g, " ")
    .replace(/\s+/g, " ");

  // Very small plural handling for common grocery items:
  // carrots -> carrot, onions -> onion, lemons -> lemon
  // Avoid stripping for words like "glass" (ends with ss).
  if (base.length > 3 && base.endsWith("s") && !base.endsWith("ss")) {
    return base.slice(0, -1);
  }

  return base;
}

