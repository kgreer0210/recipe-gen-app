import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const send = vi.hoisted(() => vi.fn());

vi.mock("@/lib/openrouter/client", () => ({
  openRouter: {
    chat: {
      send,
    },
  },
}));

vi.mock("@/lib/openrouter/models", () => ({
  FALLBACK_MODEL: "fallback-model",
}));

import { chatJson } from "@/lib/openrouter/chatJson";

function chatResult(
  content: unknown,
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
) {
  return {
    id: "gen-1",
    object: "chat.completion",
    created: 1,
    model: "primary-model",
    choices: [
      {
        index: 0,
        finishReason: "stop",
        message: { role: "assistant", content },
      },
    ],
    // Added on ChatResult in @openrouter/sdk 1.5.x. chatJson must ignore them.
    alignment: { verdict: "allow" },
    safeguardResults: [{ toolCallId: "call-1" }],
    usage,
  };
}

describe("chatJson", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("reads JSON text and token counts from a non-streaming ChatResult", async () => {
    send.mockResolvedValueOnce(
      chatResult('{"title":"Soup"}', {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      })
    );

    const result = await chatJson("system", "user", { model: "primary-model" });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].chatRequest).toMatchObject({
      model: "primary-model",
      stream: false,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
    });
    expect(result).toEqual({
      data: { title: "Soup" },
      modelUsed: "primary-model",
      usage: {
        promptTokens: 11,
        completionTokens: 7,
        totalTokens: 18,
      },
    });
  });

  it("joins text content parts and skips parts that are not text", async () => {
    send.mockResolvedValueOnce(
      chatResult([
        { type: "text", text: '{"title":' },
        { type: "image_url", image_url: { url: "https://example.invalid/a.png" } },
        { type: "text", text: '"Stew"}' },
      ])
    );

    const result = await chatJson("system", "user", { model: "primary-model" });

    expect(result.data).toEqual({ title: "Stew" });
    expect(result.usage).toBeUndefined();
  });

  it("rejects an event-stream body that has no choices", async () => {
    send.mockResolvedValueOnce({ locked: true });

    await expect(
      chatJson("system", "user", { model: "fallback-model" })
    ).rejects.toThrow("Unexpected streaming response from model");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uses the fallback model when the primary call fails", async () => {
    send.mockRejectedValueOnce(new Error("primary down"));
    send.mockResolvedValueOnce(
      chatResult('{"title":"Fallback"}', {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await chatJson("system", "user", { model: "primary-model" });

    expect(result).toEqual({
      data: { title: "Fallback" },
      modelUsed: "fallback-model",
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });
    expect(send.mock.calls[1][0].chatRequest.model).toBe("fallback-model");
    expect(send.mock.calls[1][0].chatRequest.stream).toBe(false);
    warn.mockRestore();
  });
});
