import "server-only";

import { openRouter } from "@/lib/openrouter/client";
import { FALLBACK_MODEL, PRIMARY_MODEL } from "@/lib/openrouter/models";

type ChatJsonOptions = {
  /**
   * If true, a JSON response containing { error: string } is treated as invalid
   * and will trigger a fallback model retry.
   */
  treatErrorFieldAsFailure?: boolean;

  /**
   * Optional override. If provided, we will still fallback to FALLBACK_MODEL if
   * the override fails (unless override === FALLBACK_MODEL).
   */
  modelOverride?: string;
};

export type ChatJsonResult<T> = {
  data: T;
  modelUsed: string;
};

function safeRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function callModelOnce<T>(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const result = await openRouter.chat.send({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    stream: false,
    responseFormat: { type: "json_object" },
  });

  const rawContent = result.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("No content received from model");
  }

  const content =
    typeof rawContent === "string"
      ? rawContent
      : rawContent
          .map((part) => {
            if (part && typeof part === "object" && "type" in part) {
              // Text parts are the only ones we expect in JSON mode.
              if (
                (part as { type?: unknown }).type === "text" &&
                typeof (part as { text?: unknown }).text === "string"
              ) {
                return (part as { text: string }).text;
              }
            }
            return "";
          })
          .join("");

  if (!content) {
    throw new Error("No text content received from model");
  }

  return JSON.parse(content) as T;
}

export async function chatJson<T>(
  systemPrompt: string,
  userPrompt: string,
  options: ChatJsonOptions = {}
): Promise<ChatJsonResult<T>> {
  const requestId = safeRequestId();
  const primary = options.modelOverride ?? PRIMARY_MODEL;
  const fallback = FALLBACK_MODEL;

  const treatErrorFieldAsFailure = options.treatErrorFieldAsFailure ?? false;

  const validate = (data: unknown) => {
    if (!treatErrorFieldAsFailure) return;
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      throw new Error("Model returned error field in JSON");
    }
  };

  try {
    const data = await callModelOnce<T>(primary, systemPrompt, userPrompt);
    validate(data);
    return { data, modelUsed: primary };
  } catch (primaryErr) {
    const shouldTryFallback = fallback && fallback !== primary;
    if (!shouldTryFallback) {
      throw primaryErr;
    }

    // Safe server-only observability. Avoid logging prompts/user content.
    console.warn(
      `[openrouter:${requestId}] primary_failed model=${primary} fallback=${fallback} err=${
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
      }`
    );

    const data = await callModelOnce<T>(fallback, systemPrompt, userPrompt);
    validate(data);
    return { data, modelUsed: fallback };
  }
}
