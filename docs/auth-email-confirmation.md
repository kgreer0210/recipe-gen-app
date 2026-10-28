# Email Confirmation Flow (Supabase Auth)

This documents the dashboard configuration required for the signup email
confirmation flow to work reliably, including **cross-device** confirmations
(e.g. sign up on desktop, open the confirmation email on a phone).

## How the code is wired

- `signup()` in `src/app/(auth)/actions.ts` sends confirmations through our
  callback via `emailRedirectTo: ${NEXT_PUBLIC_SITE_URL}/auth/callback?next=/generator`.
- `src/app/auth/callback/route.ts` handles **both**:
  - `?code=` → `exchangeCodeForSession` (PKCE). Requires the code-verifier
    cookie set in the **same browser** that submitted the signup form.
  - `?token_hash=&type=` → `verifyOtp`. Needs **no** cookie, so it works
    cross-device.
- On success it redirects to `next` (default `/generator`); on failure it
  redirects to `/login?error=confirmation_failed`.

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
| Confirm signup | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/generator` |
| Magic link | `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/generator` |
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
