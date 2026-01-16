# Expo React Native Parity Guide for Mise AI (Web → Mobile)

This document explains how to build an **Expo React Native** app that mirrors the behavior and core user flows of this **Next.js 16 App Router** web app.

It’s written based on the current web implementation and its “source of truth” files:

- Auth & Supabase client patterns: `src/components/AuthProvider.tsx`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`
- AI generation/refinement API routes: `src/app/api/generate-recipe/route.ts`, `src/app/api/refine-recipe/route.ts`
- Usage tracking: `src/app/api/rate-limit/route.ts`, `src/lib/usage.ts`
- Data flows + realtime subscriptions: `src/hooks/useRecipesRealtime.ts`, `src/hooks/useGroceryListRealtime.ts`, `src/hooks/useWeeklyPlanRealtime.ts`
- Mutations: `src/hooks/useRecipesMutations.ts`, `src/hooks/useGroceryListMutations.ts`, `src/hooks/useWeeklyPlanMutations.ts`
- Stripe (web-based): `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/portal/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/supabase/subscriptions.sql`
- Web route structure (screens): `src/app/*`, navigation shell: `src/components/Navigation.tsx`

You chose:

- The mobile app will **call the existing deployed Next.js API routes** for AI + rate limiting (recommended).
- The mobile app will **reuse Stripe Checkout/Portal via web** (in-app browser/WebView).

---

## Quick start checklist (the “don’t miss anything” version)

If you just want the rough order of operations:

1. **Create Expo project** (TypeScript), add navigation + Supabase + storage.
2. **Implement mobile Supabase client** with secure session persistence.
3. **Implement mobile AuthProvider** mirroring `src/components/AuthProvider.tsx` (user + subscription).
4. **Implement API client** that calls `{EXPO_PUBLIC_API_BASE_URL}/api/*` with `Authorization: Bearer <access_token>`.
5. **Build screens** mapping the web routes, wire navigation.
6. **Port stores + realtime hooks** (recipes, grocery list, weekly plan).
7. **Implement AI generator UI** (classic/pantry) and wire to `/api/generate-recipe`, `/api/refine-recipe`, `/api/rate-limit`.
8. **Implement billing** (open Stripe Checkout/Portal URL in in-app browser, refresh subscription on return).
9. **Parity QA pass** using the checklist in Section 12.

---

## 0) What "parity" means for this app

These are the core flows the mobile app should reproduce:

- **Generate recipe (AI)**: classic mode (cuisine/meal/protein/proteinCut/preferences) and pantry mode (freeform ingredients + preferences).
  - Web client calls `fetch("/api/generate-recipe")` via `src/lib/generator.ts`
  - Server route enforces auth + usage limits before calling OpenRouter: `src/app/api/generate-recipe/route.ts`
  - **Supports dynamic servings** (1-12) — pass `servings` param to generate recipes for specific portion sizes
- **Refine recipe (AI)**: refine an existing recipe with natural language instructions
  - `src/app/api/refine-recipe/route.ts`, UI in `src/components/RecipeGenerator.tsx`
  - Maintains serving size through refinements
  - Free users limited to 2 refinements per recipe in UI; server also enforces weekly limits
- **Save to collection**: inserts into `recipes` table with `servings` field: `src/hooks/useRecipesMutations.ts`
  - Database trigger enforces save limits per plan
- **Weekly plan**: insert/delete `weekly_plan` rows referencing recipe IDs: `src/hooks/useWeeklyPlanMutations.ts`
  - Can add recipes to plan from recipe detail page (`src/app/recipe/[id]/page.tsx`)
- **Grocery list**: insert/update/delete items in `grocery_list` with quantity scaling and aggregation by normalized name+unit: `src/hooks/useGroceryListMutations.ts`
  - Uses `ingredient_unit_profiles` table for smart unit conversion and purchase quantity calculation
  - Ingredients with `exclude_always=true` are filtered out (e.g., water)
- **Realtime updates**: initial fetch + Supabase Realtime subscription per user for `recipes`, `weekly_plan`, `grocery_list`: `src/hooks/use*Realtime.ts`
- **Usage tracking** (weekly limits, not daily):
  - Enforced via `check_and_increment_usage` RPC: `src/lib/usage.ts`
  - Separate limits for generate vs refine actions
  - Per-minute and per-hour burst limits
  - Weekly counters reset based on user's timezone (Monday 00:00)
  - Token tracking for fair-use enforcement
- **User settings**: timezone preference stored in `user_settings` table
  - API route: `/api/user/settings/timezone`
- **Toast notifications**: Sonner library for user feedback across the app
- **Subscription gating** (Stripe):
  - Pro users bypass most limits (still have fair-use caps)
  - Subscription state is stored in `subscriptions` table with `plan_key`; UI reads it in `AuthProvider`: `src/components/AuthProvider.tsx`
  - Checkout/Portal URLs are returned from Next routes: `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/portal/route.ts`

---

## 1) Web routes → recommended mobile screens

Web routes (from `src/app/`) and a practical mobile mapping:

### Public screens

- `/` → **HomeScreen**
- `/about` → **AboutScreen**
- `/pricing` → **PricingScreen**
- `/contact` → **ContactScreen**

### Auth screens

- `/login` → **LoginScreen** (includes password visibility toggle)
- `/signup` → **SignupScreen** (includes password visibility toggle)
- `/forgot-password` → **ForgotPasswordScreen**
- `/reset-password` → **ResetPasswordScreen** (includes password visibility toggle + confirmation validation)
- `/settings` → **SettingsScreen** (timezone preferences)

### Authenticated “Tools” (shown under Tools menu in `src/components/Navigation.tsx`)

- `/generator` → **GeneratorScreen**
- `/collection` → **CollectionScreen**
- `/weekly-plan` → **WeeklyPlanScreen**
- `/grocery-list` → **GroceryListScreen**

### Detail

- `/recipe/[id]` → **RecipeDetailScreen** (push from Collection/WeeklyPlan)

> Note: There is `src/app/invite/[token]/` but it currently contains **no implemented page** in this workspace. Don’t build invite flows into mobile until the web implementation exists.

---

## 2) Recommended React Navigation structure (closest to the web app)

The web app has a top nav with public links + “Tools” dropdown for authed screens. On mobile, the closest UX is:

- **RootStack**
  - **PublicStack** (Home/About/Pricing/Contact/Auth)
  - **AppTabs** (Generator/Collection/WeeklyPlan/GroceryList)
    - Each tab can be a Stack to support pushing RecipeDetail

### Suggested navigator layout

```ts
// RootStack
// - PublicStack
// - AppTabs (BottomTabs)
//   - GeneratorStack
//   - CollectionStack (includes RecipeDetail)
//   - WeeklyPlanStack (includes RecipeDetail)
//   - GroceryListStack
```

### Deep link URL scheme suggestion

- **App scheme**: `miseai://`
- **Universal links** (optional): `https://your-mobile-domain/...`
- **Paths**:
  - `miseai://reset-password`
  - `miseai://auth/callback` (only if you implement OAuth; email/password doesn’t require this)
  - `miseai://pricing?success=true` (Stripe return)

---

## 3) Expo project setup (dependencies + config)

This is a “parity-first” dependency checklist (you can prune later).

### Core dependencies

- `@supabase/supabase-js` (same client library family as web)
- `react-native-url-polyfill` (Supabase depends on WHATWG URL support)
- `zustand` (already used on web; easiest parity for local stores)
- React Navigation:
  - `@react-navigation/native`
  - `@react-navigation/native-stack`
  - `@react-navigation/bottom-tabs`
  - required peers: `react-native-screens`, `react-native-safe-area-context`
- Animations (web uses `motion`):
  - `react-native-reanimated`
  - `react-native-gesture-handler`
  - optional: `moti` (nice parity for “motion-like” API)
- Icons:
  - `lucide-react-native` (matches lucide usage on web)
- Clipboard:
  - `expo-clipboard` (parity with `navigator.clipboard` used by web grocery copy in `src/components/GroceryList.tsx`)
- In-app browser (Stripe web checkout/portal):
  - `expo-web-browser` (recommended)
  - optional: `react-native-webview` if you want embedded flows (higher complexity)
- Secure token storage:
  - `expo-secure-store` (recommended for Supabase session persistence)

### Toast notifications

The web uses **Sonner** for toast notifications. For mobile parity:

- **Recommended**: `react-native-toast-message` or `burnt` (native toasts)
- Alternative: Custom toast component with `react-native-reanimated`

### Styling parity options

The web uses Tailwind CSS v4. For mobile parity:

- **Recommended**: NativeWind (Tailwind-like className in RN components)
- Alternative: React Native StyleSheet (more manual; less one-for-one)

If you choose NativeWind, also add:

- `nativewind`
- configure `tailwind.config.js` in the mobile repo

### Suggested install commands (Expo)

In a new Expo app repo, you’ll typically do:

```bash
# Create a new Expo app (TypeScript template)
npx create-expo-app mise-ai-mobile --template

# Navigation (Expo-friendly)
npx expo install react-native-screens react-native-safe-area-context
npm i @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs

# Supabase + polyfills
npm i @supabase/supabase-js react-native-url-polyfill

# Secure storage (recommended for session)
npx expo install expo-secure-store

# Stripe web flows
npx expo install expo-web-browser

# Clipboard parity
npx expo install expo-clipboard

# Icons
npm i lucide-react-native

# Animations (optional but recommended for parity)
npx expo install react-native-gesture-handler react-native-reanimated

# Zustand
npm i zustand
```

If you use NativeWind:

```bash
npm i nativewind
```

---

## 4) Environment variables parity (web vs Expo)

### Web `.env.local` (from `README.md`)

Web expects:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- server-only:
  - `SUPABASE_SERVICE_ROLE_KEY` (rate limit + subscription admin tasks)
  - `OPEN_ROUTER_API_KEY` / `OPENROUTER_API_KEY` (OpenRouter server-only)
  - Stripe secrets/IDs

### Expo recommended env vars

In mobile, use Expo public env vars:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL` (your deployed Next.js origin, e.g. `https://www.mise-ai.app`)

Never ship these into mobile:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPEN_ROUTER_API_KEY` / `OPENROUTER_API_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Stripe Price IDs if you don’t want them discoverable (they’re not secrets, but keep parity with existing server routes)

### Expo config example

In your Expo app, set these in `.env` (or via EAS secrets):

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_BASE_URL=https://your-deployed-nextjs-domain
```

---

## 5) Supabase Auth on mobile (mirroring `AuthProvider`)

### Web behavior (source of truth)

`src/components/AuthProvider.tsx` provides:

- `user: User | null`
- `subscription: Subscription | null` (queried from `subscriptions` table)
- `loading: boolean`
- `refreshSubscription()`
- `supabase` client instance

Web uses:

- `createBrowserClient` (`src/lib/supabase/client.ts`) and Supabase SSR cookies on the server (`src/lib/supabase/server.ts`)

### Mobile implementation approach

In Expo you will:

- create a Supabase client with `createClient(SUPABASE_URL, ANON_KEY)`
- implement a mobile `AuthProvider` with the same shape as the web
- store session tokens securely (recommended: `expo-secure-store`)

#### Key parity requirements

- **Session restore on boot**: fetch existing session and set `user` before rendering authed screens.
- **Listen for auth state changes**: update `user` and refresh `subscription` similar to web’s `onAuthStateChange`.
- **Subscription state**:
  - When a user becomes authed, query `subscriptions` table for that `user_id` (RLS allows select by owner per `src/lib/supabase/subscriptions.sql`).
  - Use the same “active/trialing” semantics as web.

### Copy/paste module: Supabase client for Expo (with SecureStore)

Create `src/lib/supabase/client.ts` in the **mobile** repo:

```ts
import "react-native-url-polyfill/auto";

import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Minimal storage adapter that matches what supabase-js expects.
// Note: SecureStore has size limits; if you hit them, swap to AsyncStorage.
const ExpoSecureStore = {
  async getItem(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStore,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
```

### Copy/paste module: Mobile AuthProvider (parity with web context)

Create `src/context/AuthProvider.tsx` in the **mobile** repo:

```tsx
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export type Subscription = {
  id: string;
  user_id: string;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "unpaid"
    | "incomplete"
    | "incomplete_expired"
    | "paused";
  price_id: string | null;
};

type AuthContextType = {
  user: User | null;
  subscription: Subscription | null;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  subscription: null,
  loading: true,
  refreshSubscription: async () => {},
});

async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return (data as Subscription) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const userRef = useRef<User | null>(null);

  const refreshSubscription = useCallback(async () => {
    if (!userRef.current) return;
    setSubscription(await fetchSubscription(userRef.current.id));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user ?? null;

        userRef.current = sessionUser;
        if (!isMounted) return;

        setUser(sessionUser);
        if (sessionUser) {
          setSubscription(await fetchSubscription(sessionUser.id));
        } else {
          setSubscription(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const nextUser = session?.user ?? null;
        const prevUserId = userRef.current?.id ?? null;
        const nextUserId = nextUser?.id ?? null;

        if (prevUserId === nextUserId) return;

        userRef.current = nextUser;
        setUser(nextUser);

        if (nextUser) setSubscription(await fetchSubscription(nextUser.id));
        else setSubscription(null);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({ user, subscription, loading, refreshSubscription }),
    [user, subscription, loading, refreshSubscription]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

### Password reset (deep links)

Web sends reset email with:

- `redirectTo: ${origin}/auth/callback?next=/reset-password` in `src/app/(auth)/actions.ts`

Mobile options:

- **Option A (recommended for parity now)**: keep password reset flow in web (open web reset link in browser).
- **Option B**: configure Supabase reset password redirect to an Expo deep link:
  - `miseai://reset-password`
  - implement a screen that calls `supabase.auth.updateUser({ password })`

If you do Option B, ensure your Supabase project has the right “Site URL” and “Redirect URLs” configured for your deep link scheme.

---

## 6) Data model parity (tables, columns, RLS expectations)

This app relies on RLS. Mobile must not bypass RLS; it should always operate under the authed user session.

### `user_usage_counters` and RPC

- Table: `user_usage_counters(user_id, scope, window_start, count, tokens)` - composite PK
- Scopes: `week_generate`, `week_refine`, `minute_generate`, `minute_refine`, `hour_generate`, `hour_refine`
- RLS: users can `SELECT` their own rows
- RPCs (called via service role server-side):
  - `check_and_increment_usage(p_user_id, p_action, p_request_meta)` - atomic limit check + increment
  - `get_usage_status(p_user_id)` - returns current usage without incrementing
  - `record_usage_tokens(p_user_id, p_action, p_tokens)` - records token consumption

### `plan_entitlements`

- Table: `plan_entitlements(plan_key PK, weekly_generate_*, weekly_refine_*, per_minute_*, per_hour_*, save_limit, weekly_token_*)`
- Defines soft/hard limits per plan (free, pro, etc.)
- RLS: read-only for authenticated users

### `subscriptions`

Defined in `src/lib/supabase/subscriptions.sql`:

- `id` (uuid PK)
- `user_id` (uuid, unique, FK to auth.users)
- `stripe_customer_id`, `stripe_subscription_id` (text, nullable)
- `status` (text, nullable) — active, trialing, past_due, canceled, etc.
- `price_id` (text, nullable)
- `plan_key` (text, nullable) — **NEW: maps to `plan_entitlements` for usage limits** (e.g., "free", "pro")
- `created_at`, `updated_at` (timestamptz)

RLS: users can `SELECT` their own subscription only. Updates are done by Stripe webhook via service role (`src/app/api/stripe/webhook/route.ts`).

### `weekly_plan`

Defined in `src/lib/supabase/weekly_plan.sql`:

- `weekly_plan(user_id, recipe_id)` unique per pair
- RLS: users can select/insert/delete their own rows

### `recipes`

Used by:

- insert fields in `src/hooks/useRecipesMutations.ts`
- select `*` in `src/hooks/useRecipesRealtime.ts`

Table schema:

- `id` (uuid PK, default `uuid_generate_v4()`)
- `user_id` (uuid, FK to auth.users)
- `title` (text)
- `cuisine`, `meal_type`, `protein` (text, nullable)
- `prep_time`, `cook_time` (text, nullable)
- `ingredients` (jsonb, default `[]`)
- `instructions` (jsonb, default `[]`)
- `servings` (integer, default 2, check 1-12) — **NEW: dynamic serving sizes**
- `created_at` (timestamptz)

RLS: users can select/insert/update/delete their own rows.

**Note**: A database trigger `enforce_saved_recipe_limit` checks the user's plan entitlements before allowing inserts (free users have a save limit).

### `grocery_list`

Used heavily by `src/hooks/useGroceryList*`:

- `id` (uuid PK, default `uuid_generate_v4()`)
- `user_id` (uuid, FK to auth.users)
- `name` (text) — display name
- `name_normalized` (text) — **NEW: normalized name for matching/aggregation**
- `amount` (numeric, nullable)
- `unit` (text, nullable)
- `category` (text, nullable)
- `is_checked` (boolean, default false)
- `created_at` (timestamptz)

RLS: users can select/insert/update/delete their own rows.

### `ingredient_unit_profiles`

**NEW table** for ingredient normalization and purchase quantity guidance:

- `name_normalized` (text PK) — e.g., "chicken breast", "olive oil"
- `canonical_unit` (text) — preferred unit for this ingredient
- `grams_per_count` (numeric, nullable) — weight conversion
- `ml_per_count` (numeric, nullable) — volume conversion
- `pack_size_amount`, `pack_size_unit` (nullable) — common package sizes
- `display_name` (text, nullable) — pretty display name
- `exclude_always` (boolean, default false) — exclude from grocery list (e.g., water)
- `pantry_staple` (boolean, default false) — common pantry items
- `buy_unit_label` (text, nullable) — e.g., "bag", "can", "bottle"

RLS: read-only for all authenticated users.

Used by `src/lib/grocery/*` for:
- Normalizing ingredient names (`normalize.ts`)
- Canonicalizing units (`canonicalize.ts`)
- Calculating purchase quantities (`purchase.ts`)

### `user_settings`

**NEW table** for user preferences:

- `user_id` (uuid PK, FK to auth.users)
- `timezone` (text, default 'UTC') — user's timezone for weekly reset calculations
- `created_at`, `updated_at` (timestamptz)

RLS: users can select/insert/update their own row.

API route: `GET/POST /api/user/settings/timezone`

---

## 7) Realtime parity (initial fetch + subscriptions + Zustand)

### Web behavior (source of truth)

Each realtime hook follows the same pattern:

1. Wait for auth to settle
2. If no user: clear store, unsubscribe
3. If user:
   - initial fetch (`select("*")` or `select("recipe_id")`)
   - subscribe to `postgres_changes` filtered by `user_id`
   - update Zustand store on INSERT/UPDATE/DELETE

See:

- `src/hooks/useRecipesRealtime.ts`
- `src/hooks/useGroceryListRealtime.ts`
- `src/hooks/useWeeklyPlanRealtime.ts`

### Mobile considerations you must handle

- **App backgrounding**: pause/unsubscribe realtime channels when backgrounded; resubscribe on foreground.
- **Network transitions**: be resilient to disconnects; consider re-fetch on reconnect.
- **DELETE payload caveat**: web code includes optimistic updates on some deletes because filtered subscriptions + delete payloads can be unreliable in some cases (see comments in `useRecipesMutations.ts` and `useGroceryListMutations.ts`). Your mobile app should apply the same optimism where needed.

### Suggested mobile pattern

- Keep Zustand stores identical to web’s `src/lib/stores/*Store.ts` shape.
- Port the realtime hooks to the mobile repo with minimal changes:
  - replace any Next-only dependencies
  - add AppState listeners (Expo/React Native) to manage subscriptions

### Copy/paste pattern: realtime hook skeleton (mobile)

This mirrors the pattern in `src/hooks/useRecipesRealtime.ts` etc. (initial fetch + filtered realtime channel).

```ts
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSomeRealtimeThing() {
  const { user, loading: authLoading } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (authLoading) return;

    // Unauthed: cleanup + clear local state
    if (!user) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    let alive = true;

    const subscribe = () => {
      if (!alive) return;
      if (channelRef.current) return;

      const channel = supabase
        .channel(`some_table:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "some_table",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (!alive) return;
            // update your Zustand store here
          }
        )
        .subscribe();

      channelRef.current = channel;
    };

    const unsubscribe = () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };

    // Initial subscribe
    subscribe();

    // Pause realtime in background to avoid battery/network churn
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") subscribe();
      else unsubscribe();
    });

    return () => {
      alive = false;
      sub.remove();
      unsubscribe();
    };
  }, [user, authLoading]);
}
```

---

## 8) AI + rate-limit calls from mobile (calling Next.js API routes)

### Web behavior (source of truth)

- Client calls:
  - `/api/generate-recipe` via `src/lib/generator.ts`
  - `/api/refine-recipe` via `src/lib/generator.ts`
  - `/api/rate-limit` directly in `src/components/RecipeGenerator.tsx`
- Server routes:
  - use `createClient()` from `src/lib/supabase/server.ts` and `supabase.auth.getUser()`
  - enforce usage limits via `checkAndIncrementUsage()` (service role RPC) in `src/app/api/generate-recipe/route.ts`
  - call OpenRouter (server-only) via `src/lib/openrouter/*`

### Mobile request contract (what the Expo app should do)

Your Expo app should call the deployed site using `EXPO_PUBLIC_API_BASE_URL`:

- `POST {baseUrl}/api/generate-recipe`
- `POST {baseUrl}/api/refine-recipe`
- `GET  {baseUrl}/api/rate-limit`

…and include:

- `Content-Type: application/json` for POST
- `Authorization: Bearer <supabase_access_token>` on all authenticated API requests

### Copy/paste module: API client wrapper (adds Bearer token)

Create `src/lib/api.ts` in the **mobile** repo:

```ts
import { supabase } from "@/lib/supabase/client";

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL!;

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getAccessToken();

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      (json && (json.error as string)) || `Request failed: ${res.status}`;
    const err = new Error(message);
    (err as any).status = res.status;
    (err as any).body = json;
    throw err;
  }

  return json as T;
}
```

Now your generator parity functions mirror `src/lib/generator.ts` (web), but hit the deployed server:

```ts
import type { Recipe } from "@/types";
import { apiFetch } from "@/lib/api";

type GenerateParams = {
  mode: "classic" | "pantry";
  servings?: number; // 1-12, defaults to 2
  // classic mode params:
  cuisine?: string;
  meal?: string;
  protein?: string;
  proteinCut?: string;
  preferences?: string;
  // pantry mode params:
  ingredients?: string;
};

export function generateRecipe(params: GenerateParams) {
  return apiFetch<Recipe>("/api/generate-recipe", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function refineRecipe(
  currentRecipe: Recipe,
  instructions: string,
  servings?: number
) {
  return apiFetch<Recipe>("/api/refine-recipe", {
    method: "POST",
    body: JSON.stringify({ currentRecipe, instructions, servings }),
  });
}

type UsageStatus = {
  remaining: number | null;
  limit: number | null;
  isBlocked: boolean;
  planKey: string;
  generate: {
    remaining: number | null;
    limit: number | null;
    count: number;
    softLimited?: boolean;
  };
  refine: {
    remaining: number | null;
    limit: number | null;
    count: number;
    softLimited?: boolean;
  };
  resetAt: string | null;
  softLimited: boolean;
};

export function getUsageStatus() {
  return apiFetch<UsageStatus>("/api/rate-limit", { method: "GET" });
}
```

### Critical compatibility note (server-side)

Right now, these API routes authenticate via **SSR cookies** (see `src/lib/supabase/server.ts`). Expo won’t have those cookies by default.

To make mobile parity work, you need to update your backend to accept bearer tokens:

- If `Authorization: Bearer <token>` exists:
  - validate it with Supabase
  - resolve the user from the token
- Otherwise fall back to the existing cookie-based SSR flow (web)

Endpoints that need this for mobile:

- `/api/generate-recipe`
- `/api/refine-recipe`
- `/api/rate-limit`
- `/api/stripe/checkout` and `/api/stripe/portal` (if called from mobile)

> This guide doesn’t change your server code; it documents the required behavior so your Expo app doesn’t get stuck on “401 Unauthorized” despite having a valid Supabase session.

### Backend compatibility: what to implement (concrete)

The goal is to support **both**:

- **Web**: cookie-based auth via `src/lib/supabase/server.ts` (SSR cookies)
- **Mobile**: bearer-token auth via `Authorization: Bearer <supabase_access_token>`

Recommended approach:

1. Add a small helper used by API routes (e.g. `getAuthedUserFromRequest(request)`).
2. In that helper:
   - If `Authorization` header exists, validate token with Supabase and return the user.
   - Else fall back to existing SSR cookie session resolution.
3. Replace `supabase.auth.getUser()` calls in API routes with this helper so routes work for both platforms.

Pseudo-code outline:

```ts
const authHeader = request.headers.get("authorization");
if (authHeader?.toLowerCase().startsWith("bearer ")) {
  const token = authHeader.slice("bearer ".length).trim();
  // Use Supabase to validate and get user from token.
  // If invalid → return 401.
  // If valid → proceed using that user id.
} else {
  // Existing SSR cookie flow using createClient() from src/lib/supabase/server.ts
}
```

---

## 9) Stripe subscriptions on mobile (web-based flow)

### Web behavior (source of truth)

- Checkout session: `POST /api/stripe/checkout` returns `{ url }`
- Portal session: `POST /api/stripe/portal` returns `{ url }`
- Web app navigates browser to the returned URL (see `window.location.href` usage in `src/components/UserStatus.tsx`)
- Stripe webhook updates `subscriptions` table using service role: `src/app/api/stripe/webhook/route.ts`

### Mobile parity flow

1. Mobile calls `POST {baseUrl}/api/stripe/checkout` (or portal) with Authorization bearer token.
2. Open returned URL using `expo-web-browser`.
3. When the user returns to the app:
   - call `refreshSubscription()` (query `subscriptions` for the user)
   - update gating UI accordingly

### Deep link return

For best UX, update the checkout `success_url`/`cancel_url` to deep link into the app. Today the server uses:

- `success_url: {origin}/?success=true`
- `cancel_url: {origin}/pricing?canceled=true`

For mobile parity, you may add an alternate return URL when a `platform=mobile` flag is passed, e.g.:

- `miseai://pricing?success=true`

### Copy/paste snippet: open checkout/portal URL (Expo)

```ts
import * as WebBrowser from "expo-web-browser";
import { apiFetch } from "@/lib/api";

export async function openCheckout(interval: "month" | "year") {
  const { url } = await apiFetch<{ url: string }>("/api/stripe/checkout", {
    method: "POST",
    body: JSON.stringify({ interval }),
  });
  await WebBrowser.openBrowserAsync(url);
}

export async function openPortal() {
  const { url } = await apiFetch<{ url: string }>("/api/stripe/portal", {
    method: "POST",
  });
  await WebBrowser.openBrowserAsync(url);
}
```

---

## 10) UI parity notes (web APIs to replace on RN)

Here are direct parity “gotchas” pulled from the web components:

- `next/link` and `useRouter`:

  - Web: `Link`, `useRouter` (e.g. in `src/components/RecipeGenerator.tsx`, `src/components/WeeklyMeals.tsx`)
  - Mobile: React Navigation `navigation.navigate`, `navigation.push`

- Clipboard:

  - Web: `navigator.clipboard.writeText` in `src/components/GroceryList.tsx`
  - Mobile: `expo-clipboard`

- Browser navigation for Stripe:

  - Web: `window.location.href = data.url` in `src/components/UserStatus.tsx`
  - Mobile: `expo-web-browser` open the URL, then refresh subscription on return

- Modals/overlays:

  - Web uses fixed overlays with HTML/CSS
  - Mobile: `Modal` (RN) or a bottom sheet library (if you want parity with popups)

- Motion animations:
  - Web: `motion` + `AnimatePresence` in `src/components/RecipeGenerator.tsx`
  - Mobile: `reanimated` + `moti` (or React Navigation transitions)

---

## 11) Suggested Expo file/module layout (mirror web mental model)

This layout keeps concepts aligned with the web repo:

- `src/lib/supabase/client.ts` (mobile Supabase client)
- `src/lib/api.ts` (fetch wrapper for Next API routes; inject Authorization token)
- `src/context/AuthProvider.tsx` (mobile auth context mirroring web’s shape)
- `src/stores/recipesStore.ts` / `weeklyPlanStore.ts` / `groceryListStore.ts` (Zustand)
- `src/hooks/useRecipesRealtime.ts` etc. (ported realtime hooks)
- `src/screens/*` (mapped screens)
- `src/navigation/*` (navigators)

---

## 12) Testing checklist (parity-focused)

Run through these in a real device build (not only simulator).

### Auth

- Sign up → verify user created and session persists app restart
- Login/logout
- Password visibility toggle works on login/signup/reset screens
- Password reset flow works (browser-based or deep link-based)
- Password confirmation validation on reset screen
- Settings screen: can view and update timezone preference

### Generator + usage limits

- Call `GET /api/rate-limit` and display usage status (remaining generations/refinements)
- Show "blocked" UI when weekly limit reached (web behavior is in `src/components/RecipeGenerator.tsx`)
- Generate recipe classic mode with servings parameter (1-12)
- Generate recipe pantry mode (including invalid ingredient error handling)
- Refine recipe and verify serving size is maintained
- Hit weekly limit and confirm appropriate error message surfaces
- Test per-minute burst limit (rapid requests should be throttled)

### Save + realtime

- Save a recipe to `recipes` table and confirm it appears in collection via realtime
- Verify `servings` field is saved correctly
- Delete recipe and confirm local UI updates (even if realtime delete event is flaky)
- Test save limit enforcement (free users should see error when limit reached)

### Weekly plan

- Add recipe to weekly plan from collection and see it appear
- Add recipe to weekly plan from recipe detail screen
- Remove (mark as cooked) and confirm it disappears
- Toast notification appears on add/remove actions

### Grocery list

- Add ingredients from saved recipe with servings scaling
- Verify aggregation behavior (same normalized name + unit) matches `useAddToGroceryList`
- Confirm `exclude_always` ingredients (e.g., water) are filtered out
- Verify "Buy" quantities use `ingredient_unit_profiles` for smart rounding
- Toggle items checked/unchecked
- Select all / clear gathered (ensure optimistic updates match web)
- Delete individual items (verify optimistic UI update)
- Copy to clipboard exports a readable list grouped by category (same category ordering as web)

### Stripe

- Start checkout → complete purchase → return to app → `subscription` becomes active/trialing
- Open portal and manage subscription → return → subscription reflects new status

---

## 13) Implementation notes to keep parity with web constraints

- **Never call OpenRouter directly from the mobile app.** Web enforces usage limits + keeps keys server-side in `src/app/api/*`.
- **Keep RLS intact.** Mobile uses anon key + user session; service-role remains server-only.
- **Reuse "active/trialing" semantics** across gating:
  - web checks subscription status in `AuthProvider` and in usage tracking logic (`src/lib/usage.ts`, `src/app/api/rate-limit/route.ts`)
- **Keep ingredient units consistent** with `Unit` union in `src/types/index.ts` for cross-platform compatibility.
- **Servings validation**: enforce 1-12 range on mobile before sending to API.
- **Ingredient normalization**: use the same logic from `src/lib/grocery/normalize.ts` for consistent matching.
- **Weekly reset timing**: counters reset Monday 00:00 in user's timezone. Display accurate "resets in X days" messaging.
- **Toast feedback**: show toasts for key actions (save recipe, add to plan, add to grocery list) matching web UX.

---

## 14) New API endpoints summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/generate-recipe` | POST | Generate recipe with servings support |
| `/api/refine-recipe` | POST | Refine existing recipe |
| `/api/rate-limit` | GET | Get usage status (generate/refine counts, limits, reset time) |
| `/api/user/settings/timezone` | GET/POST | Get/set user timezone |
| `/api/stripe/checkout` | POST | Create Stripe checkout session |
| `/api/stripe/portal` | POST | Create Stripe billing portal session |
