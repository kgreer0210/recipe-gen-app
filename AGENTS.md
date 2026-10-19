# Agent Instructions

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **Run quality gates** (if code changed) - Tests, linters, builds
2. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
3. **Clean up** - Clear stashes, prune remote branches
4. **Verify** - All changes committed AND pushed
5. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Cursor Cloud specific instructions

This repo is a single Next.js 16 web app (Mise AI). There is no Docker Compose stack, no `supabase/` directory, and no local database. Auth, Postgres, RLS, and Realtime all talk to a **hosted Supabase project**. OpenRouter and Stripe are external HTTPS APIs, not processes to start.

**Install:** `npm ci` (see `.cursor/environment.json`).

**Required local service:** `npm run dev -- --hostname 127.0.0.1` (port 3000). Playwright's `baseURL` is `http://127.0.0.1:3000`. If you start `next dev` without that hostname (it then listens as `localhost`) and then browse or test via `127.0.0.1`, Next.js 16 blocks Server Actions as cross-origin and login stays on `/login`. Playwright e2e starts the matching command itself via `webServer` in `playwright.config.ts` (`reuseExistingServer` is on unless `CI` is set, so a mismatched already-running server will be reused).

**Env file:** put values in `.env.local` (gitignored). `.env.example` lists the same names with empty values and must stay empty. Names below are the `process.env` reads in this repo. Do not commit secret values. Cloud Agent secrets are injected as process env; a login-shell tmux may not inherit them, so if `.env.local` is missing, copy the names you need into `.env.local` before `next dev`. Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, root layout and `src/proxy.ts` still construct a Supabase client, so the app will not serve usable pages. `SUPABASE_SERVICE_ROLE_KEY` is required for usage RPCs, Stripe webhook writes, and the integration/e2e suites (they provision temporary Auth users). `OPEN_ROUTER_API_KEY` or `OPENROUTER_API_KEY` is required for live generate/refine only; Playwright stubs `/api/generate-recipe` and `/api/rate-limit`.

Public / config:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ADMIN_USER_ID`
- `ADMIN_USER_ID`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
- `NEXT_PUBLIC_BING_SITE_VERIFICATION`
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_BASE_URL` (sample client in `EXPO_MOBILE_PARITY_GUIDE.md`; the Next.js app does not read these)
- `OPENROUTER_FREE_TIER_MODEL`
- `OPENROUTER_PLUS_TIER_MODEL`
- `OPENROUTER_PRO_TIER_MODEL`
- `OPENROUTER_FALLBACK_MODEL`
- `STRIPE_PLUS_PRICE_ID`
- `STRIPE_PLUS_ANNUAL_PRICE_ID`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_PRICE_ID` (legacy Plus monthly)
- `STRIPE_ANNUAL_PRICE_ID` (legacy Plus annual)

Secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENROUTER_API_KEY` (`src/lib/openrouter/client.ts` also accepts `OPEN_ROUTER_API_KEY`)

Agents must use Stripe TEST mode only (`sk_test` keys and test price IDs) and the Supabase dev project, never production. Do not point Cloud Agent testing at production (`https://www.mise-ai.app`).

`CI`, `NODE_ENV`, `VERCEL_ENV`, and `PLAYWRIGHT_ARTIFACTS` are also read. They are runtime flags, not app configuration to put in `.env.local`.

**Quality commands** from `package.json` (`package.json` has no `typecheck` script; CI type-checks with `npx tsc --noEmit`, and `npm run build` also type-checks):

- Lint: `npm run lint` — ESLint. typescript-eslint loads `typescript` at startup and rejects TypeScript 7 (no JavaScript API yet). The lint script preloads `scripts/eslint-typescript-6.cjs`, which resolves that import to the `typescript-6` alias (`@typescript/typescript6`, the TypeScript 6 API) for the lint toolchain only. The root `typescript` package stays on 7 for `tsc` and `next build`. That alias depends on `@typescript/old`, whose `tsc` binary collides with TypeScript 7, so `prepare` runs `npm rebuild typescript` to point `tsc` back at 7. Remove the alias, the preload, and the prepare relink once typescript-eslint supports TypeScript 7: https://github.com/typescript-eslint/typescript-eslint/issues/10940
- Typecheck: `npx tsc --noEmit`
- Test: `npm test` (alias of `npm run test:unit`), `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:all`. Unit tests need no network or secrets. Integration tests need the Supabase env vars. E2e needs those vars and `npx playwright install --with-deps chromium` once per machine. Do not call live OpenRouter during e2e.
- Build: `npm run build`

`npm run dev` appends the `nextjs-agent-rules` block at the bottom of this file. That is expected Next.js 16 behavior; leave the block in place so the working tree stays clean.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
