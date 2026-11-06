import "server-only";

/**
 * The one model every account uses for recipe generation and refinement.
 * Defaults to Gemini 3 Flash Preview; OPENROUTER_PRO_TIER_MODEL overrides it.
 */
export const FAMILY_MODEL =
  process.env.OPENROUTER_PRO_TIER_MODEL ?? "google/gemini-3-flash-preview";

/**
 * Fallback model used when the primary model fails.
 * Defaults to a lighter model for reliability.
 */
export const FALLBACK_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL ?? "google/gemini-2.5-flash-lite";

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
  return (ADMIN_ALLOWED_MODELS as readonly string[]).includes(model);
}
