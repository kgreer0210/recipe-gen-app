import { describe, expect, it, vi } from "vitest";

import { endBrowserSession, type BrowserAuth } from "@/lib/auth/endBrowserSession";

function authClient(options: {
  globalError?: { message: string } | null;
  localError?: { message: string } | null;
  localRejection?: unknown;
  session?: unknown;
  sessionError?: { message: string } | null;
}): BrowserAuth & { signOut: ReturnType<typeof vi.fn>; getSession: ReturnType<typeof vi.fn> } {
  const signOut = vi.fn(async (args?: { scope?: string }) => {
    if (args?.scope === "local") {
      if ("localRejection" in options) throw options.localRejection;
      return { error: options.localError ?? null };
    }
    return { error: options.globalError ?? null };
  });
  const getSession = vi.fn(async () => ({
    data: { session: options.session ?? null },
    error: options.sessionError ?? null,
  }));
  return { signOut, getSession };
}

describe("endBrowserSession", () => {
  it("stops after a successful global sign-out", async () => {
    const auth = authClient({ session: null });

    await endBrowserSession(auth);

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith();
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("falls back to a local sign-out when the global revoke fails and this browser is signed out", async () => {
    const auth = authClient({
      globalError: new Error("offline"),
      localError: new Error("offline"),
      session: null,
    });

    await endBrowserSession(auth);

    expect(auth.signOut).toHaveBeenNthCalledWith(1);
    expect(auth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });

  it("throws and does not treat the click as finished when a session is still stored", async () => {
    const globalError = new Error("server unavailable");
    const auth = authClient({
      globalError,
      localError: new Error("server unavailable"),
      session: { user: { id: "user-1" } },
    });

    await expect(endBrowserSession(auth)).rejects.toBe(globalError);
    expect(auth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });

  it("still checks the session when local sign-out rejects after the session is gone", async () => {
    const auth = authClient({
      globalError: new Error("offline"),
      localRejection: new Error("SIGNED_OUT subscriber failed"),
      session: null,
    });

    await endBrowserSession(auth);

    expect(auth.signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("reports the local rejection when a session remains after it throws", async () => {
    const localRejection = new Error("storage locked");
    const auth = authClient({
      globalError: new Error("server unavailable"),
      localRejection,
      session: { user: { id: "user-1" } },
    });

    await expect(endBrowserSession(auth)).rejects.toBe(localRejection);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("throws when getSession returns an error and no session", async () => {
    const sessionError = new Error("could not read the session");
    const auth = authClient({ session: null, sessionError });

    await expect(endBrowserSession(auth)).rejects.toBe(sessionError);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "local" });
  });

  it("throws when a session remains after global sign-out succeeds", async () => {
    const auth = authClient({ session: { user: { id: "user-1" } } });

    await expect(endBrowserSession(auth)).rejects.toThrow("Failed to sign out");
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).not.toHaveBeenCalledWith({ scope: "local" });
  });
});
