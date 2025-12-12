import "server-only";

import { OpenRouter } from "@openrouter/sdk";

function getOpenRouterApiKey(): string {
  // Support both env var names to avoid churn:
  // - OPEN_ROUTER_API_KEY (current app convention)
  // - OPENROUTER_API_KEY (SDK docs convention)
  const key = process.env.OPEN_ROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "Missing OpenRouter API key. Set OPEN_ROUTER_API_KEY (or OPENROUTER_API_KEY)."
    );
  }
  return key;
}

export const openRouter = new OpenRouter({
  apiKey: getOpenRouterApiKey(),
});
