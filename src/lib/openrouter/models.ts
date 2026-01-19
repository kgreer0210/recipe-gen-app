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

/**
 * Whitelist of models available for admin override.
 * Server-side validation ensures only these models can be used with adminModelOverride.
 */
export const ADMIN_ALLOWED_MODELS = [
  // Tier-based models
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-3-flash-preview",

  // Claude models
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-opus",
  "anthropic/claude-3-sonnet",

  // GPT models
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "openai/gpt-4-turbo",
] as const;

/**
 * Server-side validation for admin model override.
 * Ensures only whitelisted models can be used.
 *
 * @param model - The model identifier to validate
 * @returns true if model is in the whitelist
 */
export function isValidAdminModelOverride(model: string): boolean {
  return ADMIN_ALLOWED_MODELS.includes(model as any);
}
