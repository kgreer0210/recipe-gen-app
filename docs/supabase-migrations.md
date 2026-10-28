# Supabase migrations

Database schema changes now live in `supabase/migrations/`. The Supabase CLI applies them, in filename order, to local stacks and preview branches.

## Why there is a baseline

Production's tables were created in the SQL editor, before migration tracking started. Production's migration history lists 15 versions that are not in this repo, and they cannot be replayed on an empty database. So `supabase/migrations/20261028150000_baseline.sql` is a snapshot of the production schema as of 2026-10-28, and it is the only file that creates the existing tables.

The 15 remote-only versions:

```
20260111210930  20260111212653  20260111214123  20260111214744  20260115225301
20260115231641  20260115232234  20260115232258  20260115232305  20260115232628
20260116023610  20260116024616  20260116025143  20260505145032  20260820195031
```

The baseline is idempotent, so it applies cleanly to a fresh local stack. It must never run against production.

## Working locally

You need Docker for the local stack.

```bash
npx supabase start       # starts local Postgres, Auth, and the API
npx supabase db reset    # drops the local DB, applies every migration, then runs supabase/seed.sql
npx supabase status      # prints the local API URL and keys for .env.local
```

`supabase/seed.sql` contains fake users and rows only. Its test logins are `test.cook@example.com` and `test.pro@example.com`, both with the password `password123`. Never run it against production.

Put local values in `.env.local`, which git ignores. Do not put production keys in any file you might share.

## Making a schema change

1. Create a migration: `npx supabase migration new <short_name>`.
2. Write the SQL in the new file. Use `if not exists` / `or replace` / `on conflict` where it makes sense.
3. Test it: `npx supabase db reset`, then check the app and the tests.
4. Open a PR. Review and merge it like any other change.

Do not change production through the SQL editor. Every change goes through a migration file.

## One-time step before production uses this folder

Before any `supabase db push` or GitHub-integrated branching points at this folder for production, a human must reconcile production's migration history. Kyle runs these against production, once:

```bash
# 1. Mark the baseline as already applied (it is already reflected in production's schema).
npx supabase migration repair --status applied 20261028150000

# 2. Mark the 15 remote-only versions as reverted. This only edits production's
#    migration history table; it does not change any table or data, because the
#    baseline already contains everything those versions did.
npx supabase migration repair --status reverted 20260111210930 20260111212653 20260111214123 20260111214744 20260115225301 20260115231641 20260115232234 20260115232258 20260115232305 20260115232628 20260116023610 20260116024616 20260116025143 20260505145032 20260820195031
```

Do not use `supabase migration fetch` to pull those 15 versions into `supabase/migrations/`. They sort before the baseline and cannot run on an empty database, so every `db reset` and preview branch would fail. If you want their SQL for reference, keep it outside the migrations folder.

Agents must not run any of these commands, and must not run `supabase link`, `db push`, `db pull`, or `migration repair` against production.

## Preview branches

Supabase preview branches are separate, temporary databases. With the Supabase GitHub integration they are built from this migrations folder and get `supabase/seed.sql`. A branch created from the dashboard or API instead replays production's recorded migration history, which fails until the one-time step above is done. Either way they start with no production data. They cost money for every hour they run, so delete each one when you are done.

## Who uses what

- Agents and local development use the local stack or a preview branch. Never production.
- There is no separate long-lived dev Supabase project right now. Use one of the two options above.
- Production is changed only by reviewed migrations and the one-time step above.

## Related

- `src/lib/supabase/*.sql` is historical. Those files are out of date and must not be run. The baseline migration replaces them.
