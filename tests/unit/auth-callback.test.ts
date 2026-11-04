import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeNextPath } from "@/lib/auth/safeNextPath";

const ORIGIN = "https://www.mise-ai.app";

describe("safeNextPath", () => {
  it.each([
    ["/generator", "/generator"],
    ["/reset-password", "/reset-password"],
    ["/settings", "/settings"],
    ["/recipe/abc-123/cook", "/recipe/abc-123/cook"],
    ["/weekly-plan?week=2026-11-02", "/weekly-plan?week=2026-11-02"],
    ["/generator#top", "/generator#top"],
    ["/", "/"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input, ORIGIN)).toBe(expected);
  });

  it.each([
    ["a protocol-relative URL", "//evil.com"],
    ["a protocol-relative URL with a path", "//evil.com/generator"],
    ["a slash-backslash URL", "/\\evil.com"],
    ["a path with a backslash inside", "/generator\\..\\evil"],
    ["an absolute https URL", "https://evil.com"],
    ["an absolute http URL", "http://evil.com/generator"],
    ["the site's own absolute URL", `${ORIGIN}/generator`],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["a bare host", "evil.com"],
    ["a relative path without a leading slash", "generator"],
    ["encoded slashes", "/%2F%2Fevil.com"],
    ["lowercase encoded slashes", "/%2f%2fevil.com"],
    ["an encoded backslash", "/%5Cevil.com"],
    ["an encoded tab between slashes", "/%09/evil.com"],
    ["a raw tab between slashes", "/\t/evil.com"],
    ["a raw newline", "/generator\nSet-Cookie: a=b"],
    ["an encoded newline", "/generator%0d%0aSet-Cookie:a=b"],
    ["a null byte", "/generator\u0000"],
    ["a malformed percent escape", "/%E0%A4%A"],
    ["an empty string", ""],
  ])("falls back for %s", (_label, input) => {
    expect(safeNextPath(input, ORIGIN)).toBe("/generator");
  });

  it("falls back when next is missing", () => {
    expect(safeNextPath(null, ORIGIN)).toBe("/generator");
    expect(safeNextPath(undefined, ORIGIN)).toBe("/generator");
  });

  it("uses a custom fallback when given one", () => {
    expect(safeNextPath("//evil.com", ORIGIN, "/login")).toBe("/login");
  });

  it("always returns a path that starts with exactly one slash", () => {
    const inputs = ["/generator", "//evil.com", "/\\evil.com", "https://evil.com", "", "/%2F%2Fevil.com"];
    for (const input of inputs) {
      const result = safeNextPath(input, ORIGIN);
      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
    }
  });
});

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
    },
  }),
}));

const { GET } = await import("@/app/auth/callback/route");

function callback(query: string, headers: Record<string, string> = {}) {
  return GET(new Request(`${ORIGIN}/auth/callback?${query}`, { headers }));
}

describe("auth callback redirect", () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("sends an invited user to /reset-password after verifying the invite token", async () => {
    const response = await callback("token_hash=abc&type=invite&next=/reset-password");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "abc" });
    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("sends a password-recovery link to /reset-password", async () => {
    const response = await callback("token_hash=abc&type=recovery&next=/reset-password");

    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("exchanges a PKCE code and honors a safe next", async () => {
    const response = await callback("code=xyz&next=/settings");

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings`);
  });

  it("defaults to /generator when next is missing", async () => {
    const response = await callback("token_hash=abc&type=email");

    expect(response.headers.get("location")).toBe(`${ORIGIN}/generator`);
  });

  it.each([
    ["//evil.com", "%2F%2Fevil.com"],
    ["/\\evil.com", "%2F%5Cevil.com"],
    ["https://evil.com", "https%3A%2F%2Fevil.com"],
    ["javascript:alert(1)", "javascript%3Aalert(1)"],
    ["/%2F%2Fevil.com", "%2F%252F%252Fevil.com"],
  ])("ignores an unsafe next (%s)", async (_raw, encoded) => {
    const response = await callback(`token_hash=abc&type=invite&next=${encoded}`);

    expect(response.headers.get("location")).toBe(`${ORIGIN}/generator`);
  });

  it("builds the forwarded-host redirect from the validated path only", async () => {
    const safe = await callback("token_hash=abc&type=invite&next=/reset-password", {
      "x-forwarded-host": "www.mise-ai.app",
    });
    expect(safe.headers.get("location")).toBe("https://www.mise-ai.app/reset-password");

    const unsafe = await callback("token_hash=abc&type=invite&next=%2F%2Fevil.com", {
      "x-forwarded-host": "www.mise-ai.app",
    });
    expect(unsafe.headers.get("location")).toBe("https://www.mise-ai.app/generator");
  });

  it("ignores a forwarded host that is not a bare host", async () => {
    const response = await callback("token_hash=abc&type=invite&next=/reset-password", {
      "x-forwarded-host": "evil.com/@www.mise-ai.app",
    });

    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("sends a failed exchange back to /login without following next", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error("expired") });

    const response = await callback("token_hash=abc&type=invite&next=//evil.com");

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=confirmation_failed`);
  });

  it("sends a request with no credentials back to /login", async () => {
    const response = await callback("next=/reset-password");

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login?error=confirmation_failed`);
  });
});
