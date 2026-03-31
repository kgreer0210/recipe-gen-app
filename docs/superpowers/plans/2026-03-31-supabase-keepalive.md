# Supabase Keepalive Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the Supabase free-tier database from pausing by running a Vercel cron job every 5 days that performs a real write operation against a dedicated `keepalive` table.

**Architecture:** A single-row `keepalive` table in Supabase is UPSERTed on every cron invocation. The cron is a Vercel-native schedule that hits a protected Next.js Route Handler, which validates `CRON_SECRET` before writing to the DB using the existing admin client.

**Tech Stack:** Next.js 16 App Router (Route Handlers), Supabase (service role client via `@supabase/supabase-js`), Vercel Cron (`vercel.json`)

---

### Task 1: Create the keepalive table in Supabase

**Files:**
- SQL executed in Supabase Dashboard SQL Editor (not committed to repo)

- [ ] **Step 1: Open the Supabase SQL editor**

Navigate to your Supabase project → SQL Editor → New query.

- [ ] **Step 2: Run the table creation SQL**

```sql
create table if not exists keepalive (
  id int primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint keepalive_single_row check (id = 1)
);

insert into keepalive (id, pinged_at) values (1, now())
on conflict (id) do nothing;
```

- [ ] **Step 3: Verify the table exists with one row**

Run this in the SQL editor:

```sql
select * from keepalive;
```

Expected output: one row with `id = 1` and `pinged_at` set to approximately now.

- [ ] **Step 4: Commit a SQL reference file**

Create `src/lib/supabase/keepalive.sql` with the SQL from Step 2 so it's tracked in the repo for future reference:

```sql
-- keepalive table: prevents Supabase free-tier pause by giving the cron a
-- real write target. One row only; UPSERT updates pinged_at each run.
create table if not exists keepalive (
  id int primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint keepalive_single_row check (id = 1)
);

insert into keepalive (id, pinged_at) values (1, now())
on conflict (id) do nothing;
```

```bash
git add src/lib/supabase/keepalive.sql
git commit -m "chore: add keepalive table SQL reference"
```

---

### Task 2: Create the keepalive API route

**Files:**
- Create: `src/app/api/cron/keepalive/route.ts`

- [ ] **Step 1: Create the route file**

Create `src/app/api/cron/keepalive/route.ts` with the following content:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const pingedAt = new Date().toISOString()

  const { error } = await supabase
    .from('keepalive')
    .upsert({ id: 1, pinged_at: pingedAt })

  if (error) {
    console.error('[keepalive] DB error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pinged_at: pingedAt })
}
```

- [ ] **Step 2: Verify the dev server builds without errors**

```bash
npm run build
```

Expected: build completes with no TypeScript or lint errors. The route appears in the output as `POST /api/cron/keepalive`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/keepalive/route.ts
git commit -m "feat: add keepalive cron route"
```

---

### Task 3: Create vercel.json with cron schedule

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json at the project root**

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

This schedules the cron to run at 08:00 UTC every 5 days — safely within the 7-day inactivity threshold.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel cron schedule for Supabase keepalive"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test that a missing secret returns 401**

In a new terminal:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/cron/keepalive
```

Expected output: `401`

- [ ] **Step 3: Test that a wrong secret returns 401**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/cron/keepalive \
  -H "Authorization: Bearer wrong-secret"
```

Expected output: `401`

- [ ] **Step 4: Test that the correct secret returns 200**

Replace `<your-secret>` with the value you added to Vercel. For local testing, first add `CRON_SECRET=<your-secret>` to your `.env.local` file, then:

```bash
curl -s -X POST http://localhost:3000/api/cron/keepalive \
  -H "Authorization: Bearer <your-secret>"
```

Expected output:
```json
{ "ok": true, "pinged_at": "2026-03-31T08:00:00.000Z" }
```

- [ ] **Step 5: Verify the DB row was updated**

In the Supabase SQL editor, run:

```sql
select * from keepalive;
```

Expected: `pinged_at` reflects the timestamp from the curl response above.

---

### Task 5: Deploy and verify in production

- [ ] **Step 1: Push to trigger a Vercel deployment**

```bash
git push
```

- [ ] **Step 2: Confirm the cron appears in the Vercel dashboard**

Navigate to your Vercel project → **Cron Jobs** tab. You should see one entry: `POST /api/cron/keepalive` on `0 8 */5 * *`.

- [ ] **Step 3: Trigger a manual run from the Vercel dashboard**

In the Cron Jobs tab, click **Run Now** next to the keepalive job.

Expected: the invocation shows status `200` in the logs.

- [ ] **Step 4: Confirm the DB was updated**

In the Supabase SQL editor:

```sql
select * from keepalive;
```

Expected: `pinged_at` is within the last few minutes.
