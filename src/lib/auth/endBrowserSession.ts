type AuthErrorLike = { message: string };

/**
 * The slice of `supabase.auth` this sign-out uses. Kept narrow so the fallback
 * can be tested without a live Supabase project.
 */
export type BrowserAuth = {
  signOut: (options?: {
    scope?: "global" | "local" | "others";
  }) => Promise<{ error: AuthErrorLike | null }>;
  getSession: () => Promise<{
    data: { session: unknown };
    error: AuthErrorLike | null;
  }>;
};

function hasStringMessage(value: unknown): value is { message: string } {
  if (typeof value !== "object" || value === null) return false;
  if (!("message" in value)) return false;
  return typeof value.message === "string" && value.message.length > 0;
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (hasStringMessage(error)) return new Error(error.message);
  return new Error(fallback);
}

/**
 * Signs this browser out.
 *
 * `@supabase/auth-js` 2.119 changed the default `global` scope: if the server
 * cannot revoke the session (offline, 5xx), `signOut()` returns an error and
 * leaves the local session in place. The previous release cleared this device
 * anyway. The 2.119 docs say to fall back to `{ scope: "local" }`, which
 * removes the local session before the network call, so a Sign out click still
 * signs out this browser when the global revoke fails. Other devices are
 * revoked only when the global call succeeds.
 *
 * That local call can still reject after the session is gone. Auth-js removes
 * it, then rethrows if a `SIGNED_OUT` subscriber throws. The rejection is
 * caught here so `getSession()` can decide. When the session is already gone,
 * the caller still clears in-memory recipes and leaves the page.
 *
 * Resolves once this browser has no session. Throws when a session is still
 * stored. Also throws when `getSession()` returns an error and no session,
 * because that result does not confirm the browser is signed out. The caller
 * then keeps in-memory recipes and stays on the page.
 */
export async function endBrowserSession(auth: BrowserAuth): Promise<void> {
  const { error: globalError } = await auth.signOut();
  let localSignOutRejection: unknown;
  let localSignOutRejected = false;
  if (globalError) {
    try {
      await auth.signOut({ scope: "local" });
    } catch (error: unknown) {
      localSignOutRejected = true;
      localSignOutRejection = error;
    }
  }

  const { data, error: sessionError } = await auth.getSession();
  if (data.session) {
    const failure = localSignOutRejected
      ? localSignOutRejection
      : (globalError ?? sessionError);
    throw toError(failure, "Failed to sign out");
  }
  if (sessionError) {
    throw toError(sessionError, "Failed to sign out");
  }
}
