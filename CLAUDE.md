# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build
npm run lint     # ESLint validation
npm start        # Run production server
```

No test runner is configured.

## Architecture Overview

**Mise AI** is a Next.js 16 SaaS for AI-powered recipe generation, weekly meal planning, and smart grocery lists.

### Tech Stack
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Motion (animations) + Lucide React (icons)
- Supabase (PostgreSQL + Auth with RLS)
- OpenRouter SDK (primary AI) with OpenAI SDK fallback
- Zustand (client state) + Stripe (payments)

### Directory Structure

```
src/
├── app/
│   ├── (auth)/              # Auth routes (login, signup, password reset)
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
- **Supabase**: Persistent data (recipes, collections, weekly plans, subscriptions, rate limits)
- **Zustand**: Transient UI state (current recipe, form selections, loading states)
- **React Context**: Auth session and subscription status

### Key API Routes
- `POST /api/generate-recipe` - AI recipe generation with usage tracking
- `POST /api/refine-recipe` - Recipe refinement based on user instructions
- `GET /api/rate-limit` - Get current usage status

### Usage Tracking
Uses PostgreSQL RPC functions (`check_and_increment_usage`, `get_usage_status`, `record_usage_tokens`) with the `user_usage_counters` table. Supports weekly limits, per-minute/per-hour burst limits, soft/hard limits, and token tracking. Plan entitlements are defined in `plan_entitlements` table.

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
OPENROUTER_PRIMARY_MODEL (default: google/gemini-2.5-flash-lite)
OPENROUTER_FALLBACK_MODEL (default: anthropic/claude-3.5-haiku)
```

## Key Patterns

- Path alias: `@/*` maps to `./src/*`
- Domain types: `Recipe`, `WeeklyPlanSlot`, `GroceryListItem`, `Ingredient`
- React Compiler enabled (Babel plugin)
- CORS headers configured in `next.config.ts` for mobile app support
- Ingredient processing: normalize → fetch profiles → canonicalize → format
