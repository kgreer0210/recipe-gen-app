# Spec: Busy Week dinners + Meal Style

- **Status:** Approved by Kyle 2026-10-28 (open questions resolved below)
- **Design:** Figma mockup https://www.figma.com/design/VlLQ7FRPgcXmb4nGBtSZ4U (Kyle approved it, including the parts the app didn't have yet: sheet header/footer, day chips, meal style placement in the generator)
- **Date:** 2026-10-28
- **Repo:** `kgreer0210/recipe-gen-app` @ `f163efd` (main)
- **Where this goes when committed:** the repo's existing spec convention is `docs/superpowers/specs/<date>-<slug>.md` (see the Supabase keepalive design spec). Per `docs/agents/issue-tracker.md`, the tracked work item belongs in the Notion Tasks database (Mise AI project), not GitHub Issues.

## Docs followed

| Doc | What it governs here |
|---|---|
| `AGENTS.md` → "Cursor Cloud specific instructions" | Hosted Supabase only (no local DB, no `supabase/` dir); run dev on `127.0.0.1:3000`; Stripe **test mode** and the **Supabase dev project** only, never production; never point agent testing at `https://www.mise-ai.app`; e2e must not call live OpenRouter; quality commands (lint, `npx tsc --noEmit`, unit/integration/e2e, build); read the Next.js 16 guides in `node_modules/next/dist/docs/` before writing code; leave the `nextjs-agent-rules` block in place. |
| `CLAUDE.md` | Architecture: App Router, Zustand for transient UI, Supabase for persistence, `chatJson()` with fallback model, tier models from env, usage RPCs (`check_and_increment_usage`, `get_usage_status`, `record_usage_tokens`) over `user_usage_counters` + `plan_entitlements`; RLS on all tables; "service role key used only server-side for rate-limit RPC". |
| `README.md` | Feature/schema overview. **Known stale:** it says `/api/generate-recipe` talks to OpenAI; the code uses OpenRouter (`chatJson`). This spec follows the code and `CLAUDE.md`. |
| `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md` | Notion is the tracker (`Triage: ready-for-agent | Type: enhancement`); payment/limits work is borderline `ready-for-human` per Kyle's routing rule. No `GLOSSARY.md` or `docs/adr/` exists, so terms below come from code (`WeeklyPlanSlot`, `MealSlot`, `CuisineType`, "plan key"). |
| `.env.example` | Names only. This feature needs **no new env vars**. |
| `tests/README.md` | Layering: unit = rules, no network; integration = real Supabase with temporary users, cleaned up; e2e = browser journeys with AI responses fixed. |
| `src/lib/supabase/*.sql` | Documented schema (`weekly_plan`, `kitchen_os.sql`, `usage_tracking.sql`, `subscriptions.sql`). Header says real migrations are managed as Supabase migrations. |

Vercel env var **names** checked (project `recipe-gen-app`): `OPENROUTER_FREE/PLUS/PRO_TIER_MODEL`, `OPEN_ROUTER_API_KEY`, `OPENAI_API_KEY`, `ADMIN_USER_ID`, `NEXT_PUBLIC_ADMIN_USER_ID`, `STRIPE_PLUS_PRICE_ID`, `STRIPE_PLUS_ANNUAL_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Every one targets Production, Preview and Development as a single shared entry** (see Contradictions #1).

---

## Problem

On busy weeks, planning dinners in Mise AI means running the generator once per night: choose a cuisine, meal, protein, cut, preferences, wait, save, then add each recipe to a day in the Weekly Plan. Doing that five to seven times is the opposite of what a busy family needs. There is also no way to say *how* we want to eat a dish (in a bowl, as tacos, as a sandwich, on a plate), so results often come back in a form that doesn't fit the night (e.g., a plated braise on a soccer-practice night when tacos would work).

## Solution

**Busy Week.** On the Weekly Plan page, a paid user taps **Busy week**. A sheet opens for the week currently shown. They add 1 to 7 dinner picks. Each pick has a **cuisine** (repeats allowed, e.g., Mexican twice), an optional **meal style** (defaults to "Any", so the AI chooses), and the **day** it goes on. If a chosen day already has a dinner, the sheet warns them on that pick ("Tuesday already has *Chicken Tikka*. Replace it?") and that dinner is only replaced if they confirm. Before anything starts, the sheet shows "This will use N of your M remaining recipes this week." They tap **Generate N dinners**. Mise AI creates all the recipes, saves them to the collection, and places them on the chosen days. If some fail, the ones that worked are kept, the failed ones are not charged, and the user can retry just those.

Free users see the Busy week button with a lock. Tapping it explains it's a Plus/Pro feature and links to `/pricing`.

**Meal style.** The regular generator gets the same optional **Meal style** choice (default "Any") on its preferences step, so a single recipe can also be asked for as a bowl, tacos, etc.

---

## User stories

### Busy Week: setup
1. As a paid cook, I want a **Busy week** button on my Weekly Plan, so that I can fill several dinners in one go.
2. As a paid cook, I want Busy week to plan for the week I'm currently looking at (this week or one I navigated to), so that I can plan next week ahead of time.
3. As a paid cook, I want to add between 1 and 7 dinner picks, so that I can plan as many or as few nights as I need.
4. As a paid cook, I want to choose the same cuisine more than once, so that I can have, say, two Mexican nights.
5. As a paid cook, I want each repeated cuisine to produce a different dish, so that two Mexican nights aren't the same recipe twice.
6. As a paid cook, I want to pick which day each dinner goes on, so that dinners land on the nights I actually need them.
7. As a paid cook, I want a day to be usable only once per batch, so that I don't accidentally plan two Busy-week dinners on the same night.
8. As a paid cook, I want to choose a meal style per pick (Bowl, Taco, Sandwich, Pizza, Plate, …) or leave it on "Any", so that each night's dinner fits how we want to eat it.
9. As a paid cook, I want my saved dietary preferences, disliked ingredients and default servings from Settings applied to every dinner, so that I don't have to re-enter them.
10. As a paid cook, I want to remove or change a pick before I start, so that I can fix mistakes.

### Busy Week: existing dinners
11. As a paid cook, I want a clear warning on any pick whose day already has a dinner, showing that dinner's name, so that I know what would be replaced.
12. As a paid cook, I want an existing dinner to be replaced only after I explicitly confirm for that day, so that I never lose a planned meal by accident.
13. As a paid cook, I want the replaced recipe to stay in my collection (only removed from that day), so that I can still use it later.
14. As a paid cook, if a day gets a new dinner from somewhere else (another tab/device) after I confirmed, I want Mise AI not to overwrite it, and to put the new recipe in my unscheduled tray instead, so that nothing I didn't approve is replaced.

### Busy Week: limits and plans
15. As a free cook, I want to see that Busy week exists but is locked, with a link to upgrade, so that I know what Plus/Pro offers.
16. As a paid cook, I want to see how many generations the batch will use and how many I have left this week before I start, so that there are no surprises.
17. As a paid cook, I want the batch blocked up front, with a clear message, if I don't have enough generations (or saved-recipe room) left, so that it never fails halfway for lack of quota.
18. As a paid cook, I want each dinner to count as one generation toward my plan's weekly limit, so that the rules match the single generator.
19. As a paid cook, I want any dinner that fails not to count against my limit, so that I only pay for what I got.
20. As a Pro cook past my soft limit, I want the same soft-limit behavior as the single generator, so that limits are consistent.

### Busy Week: running and results
21. As a paid cook, I want to see progress while dinners are being created (e.g., "3 of 5 ready"), so that I know it's working.
22. As a paid cook, I want a summary when it finishes listing each day, its dinner, and any that failed, so that I can see the result at a glance.
23. As a paid cook, I want a one-tap **Retry failed** that only re-runs the failed picks, so that I don't redo or re-pay for successful ones.
24. As a paid cook, if a failed pick was a confirmed replacement, I want the original dinner left in place, so that a failure never leaves a night empty.
25. As a paid cook, I want the new dinners to show in my Weekly Plan right away, and be included when I tap "Build grocery list from this week", so that shopping works like it does today.
26. As a paid cook on an iPhone, if I lock my phone or switch apps mid-batch, I want to come back and see what finished, so that I don't lose or double-pay for dinners.
27. As a paid cook, I want a double tap on Generate not to start two batches, so that I'm not charged twice.

### Meal style in the regular generator
28. As any cook, I want an optional Meal style choice in the generator, defaulting to "Any", so that I can ask for a single recipe as a bowl, tacos, etc.
29. As any cook, I want "Any" to behave exactly like today's generator, so that nothing changes unless I choose a style.
30. As any cook, I want the review step to show my chosen style, so that I can confirm before generating.
31. As any cook, I want Regenerate to keep my chosen style, so that I get another recipe of the same kind.

### Owner / operator
32. As Kyle (owner), I want Busy week enforced on the server, not just hidden in the UI, so that free users can't call it directly.
33. As Kyle, I want usage reserved and refunded atomically in Postgres, so that counters stay correct under concurrency.
34. As Kyle, I want token usage still recorded for failed attempts (as the single generator does), so that cost tracking stays honest even when a dinner is refunded.
35. As Kyle, I want the admin bypass (`ADMIN_USER_ID`) to work for Busy week like it does for generation, so that I can test without limits.

---

## Decisions

### From the grilling (settled with Kyle)
- **G1.** 1–7 picks; one dinner per pick; repeated cuisines allowed.
- **G2.** The user chooses the day for each dinner.
- **G3.** If a chosen day already has a dinner: warn, and replace only after confirmation.
- **G4.** Meal style is optional per pick, default "Any" (AI chooses).
- **G5.** Meal style is also an optional field in the regular generator.
- **G6.** Busy week is paid-plan only (Plus, Pro; admin bypass). Each dinner counts as one generation toward the plan's limit, checked up front before any generation starts.

### Product/UX decisions made in this spec (Kyle can override)
- **D1. Entry point:** a "Busy week" button on the Weekly Plan page (`WeeklyMeals` component's week header), acting on the currently displayed `weekStart`. Not added to the generator page in v1.
- **D2. Slot:** Busy week only fills the `dinner` `MealSlot`. Day = `day_of_week` 0–6 (Monday = 0, matching `DAY_LABELS` and `getWeekStart`).
- **D3. Pick → day pairing:** each pick row has its own day selector (Mon–Sun chips, not a date input). Days must be unique within a batch. Default for a new pick is the next free dinner day from today in that week (reuse `nextEmptyDinner` logic), falling back to the next unused day.
- **D4. Past days:** in the current week, days before "today" (in the user's timezone, from `user_settings.timezone`) are shown but disabled. *(Open question Q6.)*
- **D5. Protein:** Busy week doesn't ask for protein. The prompt lets the AI choose a protein that suits the cuisine and style, within dietary preferences/dislikes. `tags.protein` is whatever the AI returns.
- **D6. Servings:** from the kitchen profile (`user_settings.default_servings`, clamped 1–12), same as the single generator's fallback.
- **D7. Variety for repeats:** picks with different cuisines run in parallel. Repeats of the same cuisine run one after another, and each later one's prompt includes "avoid these dishes: <titles already made for this cuisine in this batch>".
- **D8. Meal style list (fixed, server-validated):** `Any` (default), `Bowl`, `Plate`, `Taco`, `Sandwich`, `Wrap`, `Pizza`, `Pasta`, `Soup`, `Salad`, `Skewers`. *(Open question Q3: confirm list.)* The value is an enum, never free text, so it can't be used for prompt injection.
- **D9. Style is prompt-only in v1.** It shapes the recipe but isn't stored as a new recipe column. *(Q4.)*

### Modules touched (by name, not path)
- **Types:** add a `MealStyle` union and its list constant next to `CuisineType`. Add optional `mealStyle` to `GenerateRecipeRequest`. Add Busy-week request/response types (below).
- **Recipe generation module (new, shared):** pull prompt building, the `chatJson` call, the error-field handling and the server-controlled fields (`id`, `servings`) out of the `/api/generate-recipe` route into one server-only module. Both `/api/generate-recipe` and the new Busy-week route call it. It accepts an optional meal style and an optional "avoid these dishes" list. No behavior change when style is "Any" or missing.
- **`/api/generate-recipe`:** accepts optional `mealStyle` (classic and pantry), validates it against the list (400 if unknown), and otherwise behaves as today.
- **`RecipeGenerator` component:** a Meal style selector on the preferences step (classic and pantry), shown on the review step, kept on Regenerate. Default "Any".
- **New API route `POST /api/busy-week`**, and `GET /api/busy-week/[batchId]` for status (contracts below). Follows the route conventions already used (`getAuthenticatedUser`, an `OPTIONS` handler for CORS, JSON errors).
- **Usage library (`usage.ts`):** new `reserveUsage(action, user, count)` and `releaseUsage(action, user, count, windowStart)` wrappers over new RPCs, plus their messages in `getUsageErrorMessage` (`paid_plan_required`, `insufficient_remaining`, `save_limit`). The admin bypass mirrors `checkAndIncrementUsage`.
- **Weekly plan client:** a `BusyWeekSheet` component (built on `ModalShell`), a `useBusyWeek` hook (submit, progress, status polling, retry), and conflict detection from `useWeeklyPlanStore` slots for the shown week. New rows arrive through the existing `useWeeklyPlanRealtime` / `transformWeeklyPlanRow` path. The store is also updated from the response, so it doesn't depend on Realtime.
- **Gating in UI:** use `AuthProvider`'s `subscription` (`status` active/trialing and `plan_key` plus/pro, or admin) to show the lock. The server is the source of truth.
- **`/api/rate-limit`:** unchanged. The sheet reads `generate.remaining` from it for the "uses N of M" line.

### Data / schema changes (Supabase migration, plus documenting it in the `src/lib/supabase/*.sql` docs)
1. **RPC `reserve_usage(p_user_id uuid, p_action text, p_count int) → jsonb`**, security model the same as `check_and_increment_usage` (service role only).
   - Resolves the plan with `resolve_user_plan_key`. If the plan is `free`, returns `{allowed:false, reason:'paid_plan_required'}` (the admin bypass is handled in the app layer, as today).
   - Validates `1 ≤ p_count ≤ 7`.
   - Runs the same weekly token hard-limit precheck.
   - **Atomically** checks `week_count + p_count ≤ weekly hard limit` and increments the week bucket by `p_count` in one statement. It never partially increments. When there isn't room, it returns `reason:'insufficient_remaining'` and the `remaining` count.
   - Checks the save limit: current `recipes` count + `p_count` ≤ `plan_entitlements.save_limit`, otherwise `reason:'save_limit'`. This is a pre-check only; the existing insert trigger stays authoritative.
   - Burst buckets (`minute_generate`, `hour_generate`) are incremented by **1** per batch, so plan per-minute limits (Plus = 2/min, Pro = 5/min) don't make a 7-dinner batch impossible. *(Q2.)*
   - Returns `allowed`, `plan_key`, `week_count`, `week_limit_hard`, `week_limit_soft`, `soft_limited`, `reset_at`, and **`window_start`**, which is needed to refund into the right week even if the batch crosses the Monday reset.
2. **RPC `release_usage(p_user_id uuid, p_action text, p_count int, p_window_start timestamptz) → jsonb`**: decrements that week bucket by `p_count`, never below 0. Tokens are not touched.
3. **Table `generation_batches`** (idempotency + status for resuming):
   - Columns: `id uuid pk` (client-supplied batch id), `user_id` (FK auth.users, cascade), `week_start date`, `status text` (`running` | `completed` | `partial` | `failed`), `requested int`, `succeeded int`, `results jsonb` (per pick: index, cuisine, mealStyle, dayOfWeek, status, recipeId, planSlotId, error code), `usage_window_start timestamptz`, `created_at`, `updated_at`.
   - RLS: select-own only. Writes only from the server.
   - A duplicate `id` returns the existing batch and doesn't start a new one.
4. **No change to `weekly_plan`, `recipes`, `plan_entitlements` or `subscriptions`.** The existing unique index `(user_id, week_start, day_of_week, meal_slot)` is what makes "never overwrite unconfirmed" safe at commit time.

### API contracts
**`POST /api/busy-week`** (auth required; same-origin cookie session or `Authorization: Bearer` like the other routes)
```
Request:  { batchId: uuid, weekStart: "YYYY-MM-DD" (a Monday),
            picks: [{ cuisine: CuisineType, mealStyle?: MealStyle (default "Any"),
                      dayOfWeek: 0-6, replaceSlotId?: uuid }]  // 1..7, unique dayOfWeek
            dietaryPreferences?: string[] }   // same caps as generate (≤10, ≤100 chars)
200:      { batchId, status: "completed"|"partial"|"failed",
            usage: { reserved, refunded, remaining },
            results: [{ index, cuisine, mealStyle, dayOfWeek,
                        status: "placed"|"replaced"|"unscheduled"|"failed",
                        recipe?: Recipe (saved, real DB id), planSlot?: WeeklyPlanSlot,
                        error?: "generation_failed"|"save_failed"|"slot_taken"|"plan_insert_failed" }] }
400:      validation (count, duplicate days, bad weekStart, unknown cuisine/style)
401:      unauthenticated
402/403:  { error, reason: "paid_plan_required" }   (status code: pick one; 403 recommended)
409:      { error, batchId } same batchId already running → client switches to polling GET
429:      { error, reason: "insufficient_remaining"|"save_limit"|"weekly_token_hard_limit"|"mise_blocked:per_minute"|"mise_blocked:per_hour", remaining }
```
**`GET /api/busy-week/[batchId]`** returns the stored batch row (own rows only) in the same shape as the 200 response.

### Server flow and partial failure (the contract the tests check)
1. Authenticate and validate. Insert the `generation_batches` row (status `running`); if the id is a duplicate, return 409 or the existing result.
2. `reserve_usage(generate, N)`. If not allowed, mark the batch `failed`, return 403/429, and **make no model calls**.
3. Generate each pick through the shared recipe-generation module (different cuisines in parallel, repeats in sequence, per D7). Record tokens for every attempt via `record_usage_tokens`, including failures, as today.
4. For each successful generation, save it to `recipes` with a **user-scoped** server Supabase client, so RLS and the save-limit trigger apply. The service role stays limited to usage RPCs, per `CLAUDE.md`.
5. Placement, per pick:
   - Empty day: insert into `weekly_plan` (`dinner`, servings_override = servings) → `placed`.
   - Day occupied by exactly `replaceSlotId`: delete that plan row **only now** (after the new recipe is saved), then insert → `replaced`. The old recipe stays in `recipes`.
   - Day occupied by anything else (or the unique index fires): insert with `day_of_week`/`meal_slot` null (unscheduled tray) → `unscheduled`, `slot_taken`.
6. **Refunds:** one unit is released (`release_usage`, using the reserved `window_start`) for each pick that ends `failed` with `generation_failed` or `save_failed`. Picks that produced a saved recipe are **not** refunded, even when placement failed (`plan_insert_failed`, `unscheduled`), because the recipe was delivered to the collection.
7. A pick that failed is never allowed to remove the dinner it was meant to replace.
8. Update the batch row (`completed` if all ok, `partial` if some ok, `failed` if none) and return the results. If the function dies after reserving, `generation_batches` rows stuck in `running` past the function's max duration are reconciled lazily on the next GET/POST for that user: unfinished picks are refunded and the batch is marked `partial`/`failed`.
9. Set the route's max duration high enough for 7 dinners with fallback. Check the Next 16 route segment config docs in `node_modules/next/dist/docs/` (per `AGENTS.md`) and the project's Vercel function limits. Per-call timeouts keep one slow model from holding the whole batch.

**Retry failed** sends a new `POST` with a new `batchId` containing only the failed picks. It goes through the same up-front reservation.

---

## Testing

Seams, highest public boundary first. Test behavior, not internals.

1. **`POST /api/busy-week` route handler (Vitest unit, no network).**
   - Call the exported `POST` with a `Request`. Mock the boundaries the same way `tests/unit/chat-json.test.ts` mocks the OpenRouter client: `getAuthenticatedUser`, the usage wrappers (`reserveUsage`/`releaseUsage`/`recordUsageTokens`), `chatJson` (or the OpenRouter client), and the Supabase clients.
   - Validation: 0 or 8 picks, duplicate days, a non-Monday `weekStart`, an unknown style → 400, and no reserve.
   - Free plan → 403 and zero model calls.
   - Not enough remaining → 429 with `remaining`, and zero model calls.
   - All succeed: N recipes saved, N placed, 0 refunded.
   - **Partial failure:** 2 of 5 generations throw → status `partial`, 3 placed, `release_usage` called once with count 2 and the reserved `window_start`, tokens recorded for all 5.
   - A confirmed replacement whose generation fails → the original plan row is not deleted.
   - A slot occupied by something other than `replaceSlotId` → `unscheduled`, not refunded.
   - A duplicate `batchId` → 409 and no second reserve.
   - Repeated cuisines → the second prompt contains the first title in the "avoid" list.
2. **Shared recipe-generation module / `/api/generate-recipe` (Vitest unit).** With a style, the prompt includes the style instruction. With "Any" or no style, the prompt is unchanged from today (snapshot of the current prompt, so the refactor is checked). An unknown style → 400.
3. **Pure planning helpers (Vitest unit)**, similar to `tests/unit/week-and-grocery.test.ts` and `generator-query-params.test.ts`: conflict detection for picks against existing `WeeklyPlanSlot`s in a week, default day suggestion, disabled past days across timezones (use the same New York / Los Angeles cases as the existing week-start tests), and the per-day labels/dates (`addDaysToYmd`, never `new Date("YYYY-MM-DD")`).
4. **Usage RPCs + batch table (Vitest integration, Supabase dev project)**, in the style of `tests/integration/supabase-database.test.ts` with temporary users and cleanup in `afterEach`/`afterAll`.
   - `reserve_usage` for free → `paid_plan_required`.
   - Plus with 98/100 used: reserve 3 → rejected, and the counter is still 98 (no partial increment).
   - Reserve 2 → 100.
   - `release_usage` → back down, never below 0.
   - Two concurrent reserves can't overshoot.
   - Burst buckets go up by 1 per batch.
   - `generation_batches` RLS: user B can't read user A's batch.
   - Paid status comes from inserting a `subscriptions` row with the service role (`status:'active'`, `plan_key:'plus'`). Stripe is not called.
5. **Browser journeys (Playwright, Chromium only; no WebKit project, per Kyle's Safari rule)**, added to `tests/e2e/critical-paths.spec.ts` style.
   - Paid test user (subscription row inserted via the admin client): open `/weekly-plan`, then Busy week.
   - Add 3 picks (one repeat, one style), choose a day that already has the dinner from the earlier journey, see the warning with that recipe's name, confirm, see "uses 3 of N", generate, and see the summary and the dinners in the plan.
   - A free user sees the locked button linking to `/pricing`.
   - At a 390×667 viewport, the sheet's Generate button stays topmost above the mobile nav (reuse `expectButtonIsTopmost`).
   - The generator shows Meal style and sends `mealStyle` in the stubbed `/api/generate-recipe` request.
   - The AI is never called live (`AGENTS.md`). *How* the e2e avoids it is Q7.

---

## Safari (macOS + iOS)

All user-facing parts (Busy week sheet, results, generator style picker) must work in Safari on macOS and iOS, and **must be checked by hand in Safari on the Vercel preview** (iPhone + Mac) before the work is called ready. Automated e2e stays Chromium-only, and `AGENTS.md` is not changed for this rule. See Contradictions #1 about what the preview is connected to.

- **Dates / `new Date` parsing.**
  - `week_start` is a `YYYY-MM-DD` date and days are integers 0–6. Use the `lib/week` helpers only (`parseYmd`, `addDaysToYmd`, `getZonedYmd`, `getWeekStart`, `formatWeekRange` with `timeZone: "UTC"`).
  - Never `new Date("YYYY-MM-DD HH:mm")`, which Safari parses as Invalid Date, and never bare `new Date("YYYY-MM-DD")` for local display, which is UTC midnight and can show the previous day in US timezones.
  - "Today" comes from the user's saved timezone (`fetchUserTimezone`), not the device clock in UTC.
  - Use day chips, not `<input type="date">`, whose iOS picker and empty-value behavior differ.
  - The server re-validates that `weekStart` is a Monday.
- **Viewport height (100vh vs dvh/svh).**
  - Build the sheet on `ModalShell`, which already uses `max-h-[min(90dvh,calc(100dvh-2rem))]` + `overflow-y-auto`. Don't use `100vh`/`h-screen` in new UI.
  - A bottom-sheet variant on phones should use `dvh`/`svh` and pad with `env(safe-area-inset-bottom)` so the Generate button isn't under the home indicator or the `MobileNav`.
  - `ModalShell` locks scroll with `body { overflow: hidden }`, which iOS Safari doesn't fully honor. Check that the page behind doesn't scroll or rubber-band while the sheet's pick list scrolls (`overscroll-behavior: contain` on the panel).
  - Form controls ≥16px font size so iOS doesn't zoom on focus.
  - `<select>` styling (cuisine, style) must look right with Safari's native appearance.
- **Cookies / ITP.**
  - Auth is the first-party Supabase SSR cookie on the same origin. Call `/api/busy-week` same-origin with the default credentials. Don't add third-party calls or cross-site cookies.
  - Don't keep batch state only in `localStorage`. Safari Private mode and ITP's 7-day cap on script-written storage can drop it. Keep `batchId` in memory plus `sessionStorage` as a best-effort resume, and recover from the server (`GET /api/busy-week/[batchId]` and the Weekly Plan data).
  - After an upgrade through Stripe Checkout and the redirect back, call `refreshSubscription()` so the lock clears without needing a reload or a stale cookie.
- **Long request on iOS.** iOS Safari suspends background tabs and may drop an in-flight `fetch` when the screen locks. The server keeps working and the batch row records the outcome. On `visibilitychange` back to visible (or on a fetch error), the hook polls `GET /api/busy-week/[batchId]` and refreshes the plan instead of re-POSTing. Don't depend on Realtime reconnecting after suspension.
- **Late-shipping CSS/JS features.** Use nothing newer than Safari 17 without a fallback. Check caniuse for anything newer.
  - Avoid, or guard: `Object.groupBy`/`Map.groupBy` and `Promise.withResolvers` (17.4), the new `Set` methods (`union`, `difference`; 17), the Popover API and `<dialog closedby>`, CSS anchor positioning, `field-sizing`, `text-wrap: pretty`, and View Transitions for this UI.
  - Fine: `crypto.randomUUID` (secure contexts only; previews are HTTPS), `:has()`, `structuredClone`, `AbortSignal.timeout`.
  - Motion animations must respect `prefers-reduced-motion`.

---

## Out of scope (v1)

- Breakfast, lunch or snack batches (dinner only).
- Auto-picking cuisines ("surprise me") and auto-picking days.
- Storing meal style on recipes, filtering the collection by style, or a style badge (Q4).
- Meal style as a generator URL query param (`generatorQueryPatch`).
- Pantry-based Busy week (using pantry items).
- Automatically building the grocery list after a batch (the existing "Build grocery list from this week" button covers it).
- Streaming per-dinner results over SSE/websocket (v1 returns one response, with progress estimated client-side plus status polling).
- Changing plan entitlements, prices or the pricing page copy beyond a Busy week feature bullet (Q8).
- Expo mobile client parity (`EXPO_MOBILE_PARITY_GUIDE.md`). The API accepts Bearer auth, so it can come later.
- Playwright WebKit tests and `AGENTS.md` changes.

---

## Acceptance criteria

**Quality gates (from `AGENTS.md`/`CLAUDE.md`):**
- [ ] `npm run lint` passes (no new warnings beyond the existing 3).
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm run test:unit` passes, including the new route-handler, prompt and planning tests.
- [ ] `npm run test:integration` passes against the **Supabase dev project**, including the new RPC/RLS tests.
- [ ] `npm run test:e2e` passes (Chromium, `127.0.0.1:3000`, no live OpenRouter).
- [ ] `npm run build` passes.
- [ ] The migration (2 RPCs + `generation_batches` + RLS) is applied to the **dev** project, written up in the `src/lib/supabase` SQL docs, and **not applied to production without Kyle's go-ahead**.
- [ ] Only Stripe test mode is used. No new env vars.

**Behaviors:**
- [ ] A free user can't run Busy week from the UI (locked → `/pricing`) or the API (403, zero model calls, zero usage change).
- [ ] A paid user can submit 1–7 picks with repeated cuisines. 0 or 8+ picks or duplicate days are rejected client- and server-side.
- [ ] Usage is reserved for N up front. Not enough remaining (or not enough save room) blocks before any generation, with a message showing what's left.
- [ ] Each successful dinner is saved to the collection and placed on its chosen day's dinner slot for the shown week.
- [ ] An occupied day shows a warning with the existing dinner's name. It is replaced only when confirmed for that day. The old recipe stays in the collection. A failed replacement leaves the original in place.
- [ ] A day filled after confirmation by something else isn't overwritten. The new recipe goes to the unscheduled tray.
- [ ] Partial failure: successful dinners are kept, failed ones are refunded (`release_usage`), the summary lists failures, and Retry failed re-runs only those.
- [ ] Token usage is recorded for every attempt, including failures.
- [ ] A double tap or resubmit with the same `batchId` doesn't reserve twice.
- [ ] Repeated cuisines produce different dish titles within a batch.
- [ ] The regular generator has a Meal style selector (default "Any", classic + pantry). It is sent as `mealStyle`, shown on review, and kept on Regenerate. "Any" produces today's prompt.
- [ ] Admin bypass works for Busy week.
- [ ] Checked by hand in **Safari on macOS and iOS on the Vercel preview**: the sheet fits the screen (dvh, safe area, above `MobileNav`), there's no zoom on focus, day labels and dates are correct for a US timezone, the batch survives locking the phone mid-run, and there are no console errors.

---

## Contradictions found

1. **Vercel Preview shares Production's environment.** All 17 Vercel env vars are single entries targeting Production + Preview + Development. So a Vercel preview deployment talks to the **same Supabase project and the same Stripe keys as www.mise-ai.app**. That conflicts with `AGENTS.md` ("Supabase dev project … never production") against the required "check in Safari on the Vercel preview".
   - The new migration would also have to exist in the preview's database (production) before the preview works.
   - Fix options: add Preview-scoped values that point at the dev Supabase project and Stripe test keys, or do the Safari check on a local/tunneled dev server.
2. **Limits are weekly, not monthly.** The grilling said "the plan's monthly limit", but the code and `plan_entitlements` use **weekly** limits that reset Monday 00:00 in the user's timezone (Free 5, Plus 100, Pro soft 500 / hard 1500). The spec uses weekly.
3. **Per-minute burst limits would block a batch.** Plus is limited to 2 generations/minute and Pro to 5/minute (`per_minute_generate_limit`). Counting each dinner against burst limits would make most batches fail up front. The spec counts a batch as 1 burst request (Q2).
4. **The single generator charges before validating.** `/api/generate-recipe` increments usage before validating the body and doesn't refund on model failure. Busy week refunds failures, so the two flows differ. This spec doesn't change the single generator (could be a follow-up Notion task).
5. **README is stale** (OpenAI vs OpenRouter), and Vercel still has an `OPENAI_API_KEY` the code never reads. Vercel has `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, which the code doesn't read and which isn't in `.env.example`/`AGENTS.md`. Vercel has no `OPENROUTER_FALLBACK_MODEL`, `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL` (code defaults apply). These are FYI only and don't block this feature.
6. **No migrations in the repo.** Schema lives in hosted Supabase, with SQL "docs" in `src/lib/supabase`, and there's an open High Notion task about Supabase migrations. This feature adds RPCs and a table, so how migrations are applied and tracked needs deciding (Q1).
7. **Plan-key edge cases.** `resolve_user_plan_key` treats `trialing` as paid and maps unknown/legacy plan keys to Plus, so trial and legacy users get Busy week. That's probably intended, but it's noted here.

## Open questions for Kyle

- **Q1. Migrations:** who applies the new RPCs/table to the dev project (cloud agent via the Supabase connector, or you), and should this wait for the "Supabase migrations" High task so it lands as a tracked migration file?
- **Q2. Burst limits:** OK to count a whole batch as **1** toward the per-minute/per-hour limits (it still counts N toward the weekly limit)? *Recommended: yes.*
- **Q3. Meal style list:** Any, Bowl, Plate, Taco, Sandwich, Wrap, Pizza, Pasta, Soup, Salad, Skewers. Add or remove any?
- **Q4. Store the style?** Keep it prompt-only in v1, or add a nullable `meal_style` on recipes so the collection can show and filter it later? *Recommended: prompt-only for v1.*
- **Q5. Refund edge:** a recipe that generated and saved but couldn't be placed on its day still counts (it's in your collection). Agree? *Recommended: yes.*
- **Q6. Past days:** disable days earlier than today in the current week? *Recommended: yes.*
- **Q7. Test seam (real choice):** Playwright can't stub the model server-side. Options:
  - **(a) Recommended:** stub `/api/busy-week` in the browser (like today's `/api/generate-recipe` stub) and cover the server logic with route-handler unit tests + Supabase integration tests. Downside: the e2e checks the UI, not the real write path.
  - **(b)** Add a non-production fake-model switch so e2e exercises the real route and DB writes. This needs a new env flag and guarding so it can never run in production.
- **Q8. Pricing page:** add a "Busy week planning" bullet to the Plus and Pro cards? *Recommended: yes.*
- **Q9. Preview environment** (Contradiction #1): add Preview-scoped Supabase-dev and Stripe-test env vars in Vercel so the Safari check on the preview doesn't touch production? *Strongly recommended before this ships.*
- **Q10. Status code** for a free user calling the API: 403 (recommended) or 402.

## Resolved (Kyle, 2026-10-28)

- **Q1.** The new RPCs and table go in a new migration file in `supabase/migrations/` (after `20261028150000_baseline`). The agent applies it only to the `busy-week-preview` Supabase branch for testing. Production gets it at merge time, only with Kyle's OK.
- **Q2.** A batch counts **1** toward the per-minute/per-hour limits and **N** toward the weekly limit.
- **Q3.** Meal styles: Any, Bowl, Plate, Taco, Sandwich, Wrap, Pizza, Pasta, Soup, Salad, Skewers.
- **Q4.** Prompt-only. No `meal_style` column.
- **Q5.** Saved-but-unplaced dinners are not refunded.
- **Q6.** Past days in the current week are greyed out (disabled).
- **Q7.** Option (a): mock `/api/busy-week` in Playwright; cover the server with route-handler unit tests and Supabase integration tests.
- **Q8.** Add a Busy week bullet to the Plus and Pro pricing cards.
- **Q9.** Done: Vercel Preview has Preview-only values pointing at the `busy-week-preview` Supabase branch and Stripe test keys.
- **Q10.** Free users get **403** (`reason: "paid_plan_required"`).
- Busy week is paid-only (subscription `active`/`trialing`; admin bypass), with up-front reservation of N generations and refunds on failure.
- Contradiction #1 (Preview shares Production env) is resolved by Q9. Contradiction #6 (no migrations) is resolved by PR #170.
