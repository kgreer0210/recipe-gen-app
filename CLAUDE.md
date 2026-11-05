# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start development server (port 3000)
npm run build            # Production build (also type-checks; CI runs `npx tsc --noEmit` separately)
npm run lint             # ESLint. Lint toolchain uses the typescript-6 alias; app stays on TypeScript 7. See AGENTS.md. Remove that workaround once typescript-eslint supports TypeScript 7.
npm start                # Run production server
npm run test:unit        # Vitest, tests/unit/** (grocery/ingredient rules). No network or secrets.
npm run test:integration # Vitest, tests/integration/** against the hosted Supabase project. Needs the Supabase env vars.
npm run test:e2e         # Playwright, tests/e2e/** (Chromium, binds 127.0.0.1:3000). Needs the Supabase env vars.
```

`npm test` is an alias for `test:unit`. The integration and e2e suites create temporary Auth users, so point them at a non-production Supabase project. CI runs all three plus the type check on same-repo PRs; Dependabot and fork PRs get only the type check and unit tests because GitHub withholds repository secrets from them.

## Architecture Overview

**Mise AI** is a Next.js 16 app for AI-powered recipe generation, weekly meal planning, and smart grocery lists. It is a private, invite-only family app: no public sign-up, no payments, no plans or tiers. Accounts come only from invites sent in the Supabase dashboard (see `docs/auth-email-confirmation.md`). Every account is on one `family` plan whose caps are safety limits, not product tiers.

### Tech Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Motion (animations) + Lucide React (icons)
- Supabase (PostgreSQL + Auth with RLS)
- OpenRouter SDK for all AI calls (automatic fallback to a secondary OpenRouter model)
- Zustand (client state)

### Directory Structure

```
src/
├── app/
│   ├── (auth)/              # Auth routes (login, invite-only note at /signup, password reset)
│   ├── api/                 # Backend API routes
│   │   ├── generate-recipe/ # AI recipe generation
│   │   ├── refine-recipe/   # AI recipe refinement
│   │   └── rate-limit/      # Rate limiting checks
│   ├── generator/           # Recipe generation page
│   ├── weekly-plan/         # Drag-drop meal planner
│   ├── grocery-list/        # Shopping list
│   └── collection/          # Saved recipes
├── components/              # React components (RecipeGenerator, WeeklyMeals, GroceryList)
├── hooks/                   # Custom hooks (useAuth, useRecipes*, useWeeklyPlan*, useGroceryList*)
├── lib/
│   ├── supabase/           # Supabase clients + SQL schemas + auth helpers
│   ├── openrouter/         # OpenRouter SDK + chatJson wrapper + model config
│   ├── stores/             # Zustand stores (weeklyPlan, recipes, groceryList)
│   └── grocery/            # Ingredient normalization + unit conversion
└── types/                   # TypeScript types (Recipe, Ingredient, CuisineType)
```

### Server/Client Component Strategy
- **Server Components**: Data fetching, layout shells, SEO content
- **Client Components** (`use client`): Interactive forms, drag-drop UI, animations, Zustand state

### State Management
- **Supabase**: Persistent data (recipes, collections, weekly plans, rate limits)
- **Zustand**: Transient UI state (current recipe, form selections, loading states)
- **React Context**: Auth session

### Key API Routes
- `POST /api/generate-recipe` - AI recipe generation with usage tracking
- `POST /api/refine-recipe` - Recipe refinement based on user instructions
- `GET /api/rate-limit` - Get current usage status

### Usage Tracking
Uses PostgreSQL RPC functions (`check_and_increment_usage`, `get_usage_status`, `record_usage_tokens`) with the `user_usage_counters` table. Supports weekly limits, per-minute/per-hour burst limits, soft/hard limits, and token tracking. Every account resolves to the `family` row in the `plan_entitlements` table (150 recipes and 300 refinements a week, 10 a minute and 60 an hour, 1M tokens a week, no saved-recipe cap). The old free, plus and pro rows and the `subscriptions` table are kept in the database but unused.

### AI Integration
OpenRouter is primary (`chatJson()` wrapper in `src/lib/openrouter/chatJson.ts`). Automatic fallback to secondary model on failure. Models configured via environment variables.

### Database Security
All tables enforce RLS policies: users can only access rows where `user_id` matches their authenticated UUID. Service role key used only server-side for rate-limit RPC.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPEN_ROUTER_API_KEY (or OPENROUTER_API_KEY)
```

Optional model configuration (one model for every account):
```
OPENROUTER_PRO_TIER_MODEL (default: google/gemini-3-flash-preview; the model everyone uses)
OPENROUTER_FALLBACK_MODEL (default: google/gemini-2.5-flash-lite)
```
Optional admin bypass (unlimited usage, model picker): `ADMIN_USER_ID` and `NEXT_PUBLIC_ADMIN_USER_ID`.

## Key Patterns

- Path alias: `@/*` maps to `./src/*`
- Domain types: `Recipe`, `WeeklyPlanSlot`, `GroceryListItem`, `Ingredient`
- React Compiler enabled (Babel plugin)
- CORS headers configured in `next.config.ts` for mobile app support
- Ingredient processing: normalize → fetch profiles → canonicalize → format
- Auth is login-only. Supabase public sign-ups are off. `/auth/callback` only follows a same-origin relative `next` (`src/lib/auth/safeNextPath.ts`), and failed links redirect to `/login?error=<code>` (`src/lib/auth/loginNotice.ts`).

## Agent skills

### Issue tracker

Issues live in the Notion Tasks database, filtered to the Mise AI project, via the Notion MCP. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles, stored as a `Triage:` line in each task's Notes (Notion has no labels). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
