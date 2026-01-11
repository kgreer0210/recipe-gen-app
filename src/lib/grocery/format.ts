import type { Unit } from "@/types";

function roundToTwo(amount: number) {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function stripTrailingZeros(value: string) {
  return value.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function toMixedFractionString(amount: number, denom: number): string | null {
  const whole = Math.floor(amount);
  const frac = amount - whole;
  const num = Math.round(frac * denom);
  if (num === 0) return String(whole);
  if (num === denom) return String(whole + 1);

  const g = gcd(num, denom);
  const n = num / g;
  const d = denom / g;

  const fractional = `${n}/${d}`;
  return whole > 0 ? `${whole} ${fractional}` : fractional;
}

export function formatRecipeAmount(amount: number, unit: Unit): string {
  if (!Number.isFinite(amount)) return "0";

  // Friendly fractions for common cooking measures & counts.
  const fractionUnits: Unit[] = ["cup", "tbsp", "tsp", "count", "slice", "clove"];
  if (fractionUnits.includes(unit) && amount > 0 && amount < 10) {
    const denoms = [2, 3, 4, 8];
    for (const denom of denoms) {
      const approx = Math.round(amount * denom) / denom;
      if (Math.abs(approx - amount) <= 0.02) {
        const asFrac = toMixedFractionString(approx, denom);
        if (asFrac) return asFrac;
      }
    }
  }

  return stripTrailingZeros(String(roundToTwo(amount)));
}

