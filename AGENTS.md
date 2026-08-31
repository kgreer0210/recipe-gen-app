# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Cursor Cloud specific instructions

This repo is a single Next.js 16 web app (Mise AI). There is no Docker Compose stack, no `supabase/` directory, and no local database. Auth, Postgres, RLS, and Realtime all talk to a **hosted Supabase project**. OpenRouter and Stripe are external HTTPS APIs, not processes to start.

**Required local service:** `npm run dev -- --hostname 127.0.0.1` (port 3000). Playwright's `baseURL` is `http://127.0.0.1:3000`. If you start `next dev` without that hostname (it then listens as `localhost`) and then browse or test via `127.0.0.1`, Next.js 16 blocks Server Actions as cross-origin and login stays on `/login`. Playwright e2e starts the matching command itself via `webServer` in `playwright.config.ts` (`reuseExistingServer` is on unless `CI` is set, so a mismatched already-running server will be reused).

**Env file:** put secrets in `.env.local` (gitignored). Canonical names and optional model overrides are in `README.md` and `CLAUDE.md`. Cloud Agent secrets are injected as process env; a login-shell tmux may not inherit them, so if `.env.local` is missing, copy `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPEN_ROUTER_API_KEY` into `.env.local` before `next dev`. Without `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, root layout and `src/proxy.ts` still construct a Supabase client, so the app will not serve usable pages. `SUPABASE_SERVICE_ROLE_KEY` is required for usage RPCs, Stripe webhook writes, and the integration/e2e suites (they provision temporary Auth users). `OPEN_ROUTER_API_KEY` (or `OPENROUTER_API_KEY`) is required for live generate/refine only; Playwright stubs `/api/generate-recipe` and `/api/rate-limit`.

After a server-action login, `/generator` can render while `AuthProvider`'s client `getSession()` still returns null (it overwrites `initialUser`). That makes the header email assertion fail and `Save to Collection` redirect to `/login`. For a Cloud Agent hello-world, generate and save through `POST /api/generate-recipe` with a Bearer token from `signInWithPassword` instead of relying on that client session.

**Quality commands** (see `package.json` / `CLAUDE.md`):

- `npm run lint` — ESLint. The current tree already fails this with pre-existing errors; do not treat a dirty lint run as proof that your change broke lint unless the files you touched are new offenders.
- `npm run test:unit` — Vitest grocery/ingredient rules. No network or secrets.
- `npm run test:integration` — real Supabase RLS/CRUD. Needs the three Supabase env vars.
- `npm run test:e2e` — Chromium journeys (home → login → generate/save). Needs the three Supabase env vars and `npx playwright install --with-deps chromium` once per machine. Do not call live OpenRouter during this suite.

Do not point Cloud Agent testing at production (`https://www.mise-ai.app`). Use `.env.local` against a non-production Supabase project.

`npm run dev` appends the `nextjs-agent-rules` block at the bottom of this file. That is expected Next.js 16 behavior; leave the block in place so the working tree stays clean.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
