/**
 * Admin utilities for Mise AI
 *
 * Provides client-side admin detection and model configuration for admin-only features.
 */

/**
 * Available AI models for admin selection
 * Includes models from multiple providers (Gemini, Claude, GPT)
 */
export const ADMIN_MODEL_OPTIONS = [
  // Gemini Models (tier-based defaults)
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Free Tier)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Plus Tier)' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview (Pro Tier)' },

  // Claude Models
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3-opus', label: 'Claude 3 Opus' },
  { value: 'anthropic/claude-3-sonnet', label: 'Claude 3 Sonnet' },

  // GPT Models
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo' },
] as const;

/**
 * Client-side admin detection
 *
 * NOTE: This is for UX only (showing/hiding UI elements).
 * Security enforcement happens server-side in the API routes.
 *
 * @param userId - The authenticated user's UUID
 * @returns true if user is an admin
 */
export function isAdminUser(userId: string | undefined): boolean {
  if (!userId) return false;

  const adminId = process.env.NEXT_PUBLIC_ADMIN_USER_ID;
  if (!adminId) {
    console.warn('[Admin] NEXT_PUBLIC_ADMIN_USER_ID not configured');
    return false;
  }

  return userId === adminId;
}
