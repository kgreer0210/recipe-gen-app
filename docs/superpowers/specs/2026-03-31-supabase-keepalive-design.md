# Supabase Keepalive Cron — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Problem

Supabase free-tier projects pause after 7 days of database inactivity. Since Mise AI has no regular users yet, the database can reach this threshold, breaking sign-in and all data operations for anyone visiting the app as a portfolio piece.

## Solution

A Vercel cron job that fires every 5 days and performs a lightweight write operation against the Supabase database. This keeps the database active without requiring manual intervention or upgrading to a paid Supabase plan.

## Scope

Three changes, no existing code modified:

1. A new `keepalive` table in Supabase
2. A new API route `POST /api/cron/keepalive`
3. A cron entry in `vercel.json`

---

## Database

A `keepalive` table with a single row:

```sql
create table if not exists keepalive (
  id int primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into keepalive (id, pinged_at) values (1, now())
on conflict (id) do nothing;
```

- No RLS required — only touched server-side via the service role key
- The `check (id = 1)` constraint enforces exactly one row forever
- The cron UPSERTs this row on each run (a real write transaction)

---

## API Route

**File:** `src/app/api/cron/keepalive/route.ts`

- Method: `POST`
- Auth: validates `Authorization: Bearer <CRON_SECRET>` header — Vercel injects this automatically for cron invocations
- Uses the existing `createAdminClient()` from `src/lib/supabase/admin.ts` (service role key, no RLS bypass needed)
- Performs: `upsert({ id: 1, pinged_at: new Date().toISOString() })` on the `keepalive` table
- Returns `{ ok: true, pinged_at: <timestamp> }` on success
- Returns 401 if the secret is missing or wrong
- Returns 500 with error detail if the DB write fails

---

## Cron Schedule

**File:** `vercel.json` (create if absent)

```json
{
  "crons": [
    {
      "path": "/api/cron/keepalive",
      "schedule": "0 8 */5 * *"
    }
  ]
}
```

- Runs at 08:00 UTC every 5 days — well within the 7-day inactivity threshold
- Vercel Pro supports multiple cron jobs; this uses one slot

---

## Environment Variables

| Variable | Where set | Purpose |
|----------|-----------|---------|
| `CRON_SECRET` | Vercel dashboard (all environments) | Authenticates cron invocations |

The value is a secret string you choose. Vercel automatically passes it as `Authorization: Bearer <CRON_SECRET>` when invoking cron routes.

---

## What This Does Not Change

- No existing Supabase clients, hooks, or API routes are modified
- No auth or RLS logic is touched
- No new dependencies are added

---

## Success Criteria

- The Supabase project never reaches 7 days of inactivity
- The cron route returns 200 when invoked with the correct secret
- The cron route returns 401 when invoked without the correct secret
- The `keepalive.pinged_at` timestamp updates on each successful run
