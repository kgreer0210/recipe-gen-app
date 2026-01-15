import { Ingredient, Unit } from "@/types";
import type { IngredientUnitProfile } from "@/lib/grocery/unitProfiles";

export type PurchaseQuantity = {
  needAmount: number;
  needUnit: Unit;
  buyAmount: number;
  buyUnit: string;
  reason?: string;
};

function roundToTwoDecimals(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  // Avoid floating-point artifacts like 1.2000000000000002
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

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
  ingredient: Pick<Ingredient, "amount" | "unit" | "category" | "name">,
  profile?: IngredientUnitProfile
): PurchaseQuantity {
  const needAmount = ingredient.amount;
  const needUnit = ingredient.unit;

  // Default: buy exactly what you need
  let buyAmount = needAmount;
  let buyUnit: string = needUnit;
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

  // Optional: package sizing guidance from unit profiles (package_preferred).
  // If provided, round up to common pack sizes (e.g., soy sauce: 500 ml).
  if (
    profile?.pack_size_amount &&
    profile.pack_size_amount > 0 &&
    profile.pack_size_unit
  ) {
    const packUnit = profile.pack_size_unit;
    const packSize = profile.pack_size_amount;

    // Only apply when the unit matches; canonicalization happens earlier on write.
    if (needUnit === packUnit) {
      // If we know the packaging label (bottle/bag/box), return “N bottles”, not “500 ml”.
      if (profile.buy_unit_label) {
        buyUnit = profile.buy_unit_label;
        buyAmount = Math.ceil(needAmount / packSize);
        reason = "Common package size";
      } else {
        buyUnit = packUnit;
        buyAmount = Math.ceil(needAmount / packSize) * packSize;
        reason = "Common package size";
      }
    }
  }

  // Display guardrail: keep at most 2 decimals to avoid noisy floats in UI.
  // (We keep it numeric so existing rendering/template strings keep working.)
  buyAmount = roundToTwoDecimals(buyAmount);
  const roundedNeedAmount = roundToTwoDecimals(needAmount);

  return { needAmount: roundedNeedAmount, needUnit, buyAmount, buyUnit, reason };
}
