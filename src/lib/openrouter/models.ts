import "server-only";

/**
 * Tier-based model configuration.
 * Each tier maps to a specific model for recipe generation.
 *
 * - free: Slower, more cost-effective model (also used as fallback)
 * - plus: Faster, higher quality model
 * - pro/admin: Fastest, highest quality model
 */
export const TIER_MODELS = {
  free: process.env.OPENROUTER_FREE_TIER_MODEL ?? "google/gemini-2.5-flash-lite",
  plus: process.env.OPENROUTER_PLUS_TIER_MODEL ?? "google/gemini-2.5-flash",
  pro: process.env.OPENROUTER_PRO_TIER_MODEL ?? "google/gemini-3-flash-preview",
  admin: process.env.OPENROUTER_PRO_TIER_MODEL ?? "google/gemini-3-flash-preview",
} as const;

/**
 * Fallback model used when the primary tier model fails.
 * Defaults to the free tier model for reliability.
 */
export const FALLBACK_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL ?? TIER_MODELS.free;

export type PlanTier = keyof typeof TIER_MODELS;

/**
 * Get the appropriate model for a given plan tier.
 * Falls back to free tier model if tier is unknown.
 */
export function getModelForTier(planKey: string): string {
  if (planKey in TIER_MODELS) {
    return TIER_MODELS[planKey as PlanTier];
  }
  // Default to free tier for unknown plan keys
  return TIER_MODELS.free;
}
