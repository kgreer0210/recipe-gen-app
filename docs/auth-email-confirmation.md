# Email Confirmation Flow (Supabase Auth)

This documents the dashboard configuration required for the emailed-link flows
(invites, password resets) to work reliably, including **cross-device** links
(e.g. request one on desktop, open the email on a phone).

## Invite-only

Mise AI is a private family app. **Public sign-ups are turned off in the Supabase
dashboard** (Authentication → Sign In / Providers), and that setting is the real
lock; the app has no sign-up form (`/signup` is a static invite-only note).
Accounts are created by inviting people from the Supabase dashboard
(Authentication → Users → Invite user). The **Invite user** email below sends the
person to `/auth/callback?token_hash=…&type=invite&next=/reset-password`, where
they set a password and then continue into the app. After that they sign in at
`/login`. If an invite or reset link has expired or was already used, the callback
sends them to `/login?error=invite_expired` (or `reset_expired` /
`confirmation_failed`) and the login page shows a friendly message. Invite
links expire (see the dashboard's OTP expiry); send a new invite to re-issue one.

## How the code is wired

- `resetPassword()` in `src/app/(auth)/actions.ts` sends reset emails through our
  callback via `redirectTo: ${NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`.
  There is no `signup()` action any more.
- `src/app/auth/callback/route.ts` handles **both**:
  - `?code=` → `exchangeCodeForSession` (PKCE). Requires the code-verifier
    cookie set in the **same browser** that requested the link.
  - `?token_hash=&type=` → `verifyOtp`. Needs **no** cookie, so it works
    cross-device.
- On success it redirects to `next` (default `/generator`). Only a same-origin
  relative path is accepted (`src/lib/auth/safeNextPath.ts`); anything else falls
  back to `/generator`. On failure it redirects to `/login?error=<code>`:
  `invite_expired` (type `invite`), `reset_expired` (type `recovery`) or
  `confirmation_failed` (anything else). `src/lib/auth/loginNotice.ts` maps those
  codes, and Supabase's `error_code=otp_expired` / `error=access_denied`, to fixed
  messages. Query text is never shown.

## Required Supabase dashboard configuration

### 1. Branded templates with token-hash links (cross-device safe)

All Supabase auth emails use the branded HTML in `supabase/templates/` (subjects and
paths in `supabase/config.toml`, logo at `https://www.mise-ai.app/email-logo.png` from
`public/email-logo.png`). Production does not read `config.toml`, so after changing a
template, paste it into **Authentication → Emails** (or PATCH the Management API
`/v1/projects/{ref}/config/auth` `mailer_subjects_*` / `mailer_templates_*_content`).
Supabase renders them with Go `html/template`, which strips HTML comments, so keep
the templates comment-free.

Link emails skip `{{ .ConfirmationURL }}` and go straight to our callback with
`token_hash`, which routes through `verifyOtp` and needs no code-verifier cookie:

| Template | Link |
|---|---|
| Confirm signup (unused: sign-ups are off) | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/generator` |
| Magic link (unused) | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/generator` |
| Invite user | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password` |
| Reset password | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Change email | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/settings` |

Reauthentication shows `{{ .Token }}` as a code. Security notifications are on only
for password changed and email changed; phone, linked sign-in and MFA notifications
stay off because the app doesn't use them.

### 2. URL configuration

**Authentication → URL Configuration**:

- **Site URL**: your real origin (e.g. `https://www.mise-ai.app`). Must match
  `NEXT_PUBLIC_SITE_URL`.
- **Redirect URLs** (allow-list) must include:
  - `https://www.mise-ai.app/auth/callback`
  - `http://localhost:3000/auth/callback` (for local dev)

If the callback URL is not allow-listed, Supabase silently ignores
`emailRedirectTo` and the confirmation tab will not initialize the session.

### 3. Environment variable

Ensure `NEXT_PUBLIC_SITE_URL` is set in the deployment environment (the code
falls back to `https://www.mise-ai.app` if unset).
