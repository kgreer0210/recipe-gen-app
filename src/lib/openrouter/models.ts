import "server-only";

export const PRIMARY_MODEL =
  process.env.OPENROUTER_PRIMARY_MODEL ?? "google/gemini-2.5-flash";

export const FALLBACK_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL ?? "anthropic/claude-3.5-haiku";
