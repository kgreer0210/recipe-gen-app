/** Where the auth callback sends people when `next` is missing or unsafe. */
export const DEFAULT_NEXT_PATH = "/generator";

// Control characters (C0 range and DEL). Browsers strip tabs and newlines from
// URLs, so "/\t/evil.com" would otherwise turn into "//evil.com".
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (CONTROL_CHARS.test(value)) return false;
  return true;
}

/**
 * Returns `next` only when it is a same-origin relative path, otherwise
 * `fallback`. The result always starts with exactly one "/", so it is safe to
 * append to an origin.
 *
 * Rejected: absolute URLs, "//host", "/\host", any backslash or control
 * character, and percent-encoded forms of those ("/%2F%2Fevil.com",
 * "/%5Cevil.com", "/%09/evil.com").
 */
export function safeNextPath(
  next: string | null | undefined,
  origin: string,
  fallback: string = DEFAULT_NEXT_PATH
): string {
  if (!next || !isSafeRelativePath(next)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (!isSafeRelativePath(decoded)) return fallback;

  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return fallback;
    // Dot segments resolve during parsing: "/a/..//evil.com" becomes "//evil.com",
    // which a browser reads as a protocol-relative URL.
    if (url.pathname.startsWith("//")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
