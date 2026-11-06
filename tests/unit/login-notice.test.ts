import { describe, expect, it } from "vitest";

import { CALLBACK_ERROR, loginNoticeMessage } from "@/lib/auth/loginNotice";

describe("loginNoticeMessage", () => {
  it("says an expired invite needs a new one from Kyle", () => {
    expect(loginNoticeMessage({ error: CALLBACK_ERROR.inviteExpired })).toBe(
      "This invite link expired. Ask Kyle for a new one."
    );
  });

  it("explains an expired reset link and points at Forgot your password", () => {
    const message = loginNoticeMessage({ error: CALLBACK_ERROR.resetExpired });
    expect(message).toMatch(/password reset link expired/);
    expect(message).toMatch(/Forgot your password/);
  });

  it.each([
    [{ error: "confirmation_failed" }],
    [{ error: "link_expired" }],
    [{ error: "access_denied" }],
    [{ error_code: "otp_expired" }],
    [{ error: "access_denied", error_code: "otp_expired" }],
  ])("shows the generic expired-link message for %j", (params) => {
    expect(loginNoticeMessage(params)).toMatch(/link expired or was already used/);
  });

  it("prefers the specific callback message when Supabase's code is also present", () => {
    expect(loginNoticeMessage({ error: "invite_expired", error_code: "otp_expired" })).toMatch(/invite link expired/);
  });

  it.each([
    [{}],
    [{ error: null, error_code: null }],
    [{ error: "" }],
    [{ error: "server_error" }],
    [{ error_code: "something_else" }],
  ])("shows nothing for %j", (params) => {
    expect(loginNoticeMessage(params)).toBeNull();
  });

  it("never echoes query text into the message", () => {
    const hostile = ["<script>alert(1)</script>", "javascript:alert(1)", "Ask evil.com for a new one"];
    for (const value of hostile) {
      expect(loginNoticeMessage({ error: value })).toBeNull();
      expect(loginNoticeMessage({ error_code: value })).toBeNull();
    }
    for (const error of [CALLBACK_ERROR.inviteExpired, CALLBACK_ERROR.resetExpired, "access_denied"]) {
      const message = loginNoticeMessage({ error }) ?? "";
      expect(message).not.toContain(error);
    }
  });
});
