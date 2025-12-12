import { Ingredient, Unit } from "@/types";

export type PurchaseQuantity = {
  needAmount: number;
  needUnit: Unit;
  buyAmount: number;
  buyUnit: Unit;
  reason?: string;
};

function roundUpToWhole(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  return Math.ceil(Math.max(0, amount));
}

function toLb(amount: number, unit: Unit): number | null {
  if (!Number.isFinite(amount)) return null;
  if (unit === "lb") return amount;
  if (unit === "oz") return amount / 16;
  return null;
}

/**
 * Compute a "what to buy" quantity while preserving the original "what you need".
 *
 * Current defaults (intentionally simple):
 * - Meat + lb/oz: round up to a minimum of 1 lb, then 1 lb steps.
 * - count/slice/clove: round up to whole numbers.
 * - everything else: same as needed.
 */
export function getPurchaseQuantity(
  ingredient: Pick<Ingredient, "amount" | "unit" | "category" | "name">
): PurchaseQuantity {
  const needAmount = ingredient.amount;
  const needUnit = ingredient.unit;

  // Default: buy exactly what you need
  let buyAmount = needAmount;
  let buyUnit = needUnit;
  let reason: string | undefined;

  const category = (ingredient.category || "").toLowerCase();

  // Meat rounding for weight
  if (category === "meat" && (needUnit === "lb" || needUnit === "oz")) {
    const needLb = toLb(needAmount, needUnit);
    if (needLb !== null) {
      buyUnit = "lb";
      buyAmount = Math.ceil(Math.max(1, needLb));
      reason = "Commonly sold in ~1 lb increments";
    }
  }

  // Count-like units: buy whole numbers
  if (needUnit === "count" || needUnit === "slice" || needUnit === "clove") {
    buyAmount = roundUpToWhole(needAmount);
    buyUnit = needUnit;
    reason = "Count items are purchased whole";
  }

  // Guardrails
  if (!Number.isFinite(buyAmount) || buyAmount < 0) {
    buyAmount = 0;
  }

  return { needAmount, needUnit, buyAmount, buyUnit, reason };
}
