/**
 * Friendly messages for the /login page when an emailed link did not work.
 *
 * The auth callback redirects to /login?error=<code> with one of the codes
 * below. Supabase's own redirects can also carry `error` (e.g. access_denied)
 * and `error_code` (e.g. otp_expired). Only these known codes map to a fixed
 * message. Anything else returns null, and no query text is ever shown.
 */

export type LoginNoticeParams = {
  error?: string | null;
  error_code?: string | null;
};

/** Codes our callback sends. Kept here so the route and the page agree. */
export const CALLBACK_ERROR = {
  inviteExpired: "invite_expired",
  resetExpired: "reset_expired",
  generic: "confirmation_failed",
} as const;

const INVITE_EXPIRED = "This invite link expired. Ask Kyle for a new one.";
const RESET_EXPIRED =
  "This password reset link expired or was already used. Use “Forgot your password?” to get a new one.";
const LINK_EXPIRED =
  "This link expired or was already used. Ask Kyle for a new invite, or use “Forgot your password?” if you already have an account.";

export function loginNoticeMessage(params: LoginNoticeParams): string | null {
  switch (params.error) {
    case CALLBACK_ERROR.inviteExpired:
      return INVITE_EXPIRED;
    case CALLBACK_ERROR.resetExpired:
      return RESET_EXPIRED;
    case CALLBACK_ERROR.generic:
    case "link_expired":
    case "access_denied":
      return LINK_EXPIRED;
  }

  if (params.error_code === "otp_expired") return LINK_EXPIRED;

  return null;
}
