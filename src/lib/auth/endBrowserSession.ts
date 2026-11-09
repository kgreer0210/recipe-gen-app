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

function toError(error: AuthErrorLike | null, fallback: string): Error {
  if (error instanceof Error) return error;
  if (error?.message) return new Error(error.message);
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
 * Resolves once this browser has no session. Throws when a session is still
 * stored, so the caller does not clear in-memory recipes or leave the page.
 */
export async function endBrowserSession(auth: BrowserAuth): Promise<void> {
  const { error: globalError } = await auth.signOut();
  if (globalError) {
    await auth.signOut({ scope: "local" });
  }

  const { data, error: sessionError } = await auth.getSession();
  if (data.session) {
    throw toError(globalError ?? sessionError, "Failed to sign out");
  }
}
