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

### 1. Use a token-hash confirmation link (cross-device safe)

By default Supabase's "Confirm signup" template emits a PKCE `?code=` link,
which only works in the original browser. To make confirmation work on any
device, change the template to send `token_hash` instead.

**Authentication → Email Templates → Confirm signup**, set the link to:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/generator
```

This routes through `verifyOtp`, which does not depend on the code-verifier
cookie, so the link works regardless of which browser/device opens it.

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
