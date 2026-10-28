-- =============================================================================
-- Baseline schema for Mise AI (migration 20261028150000)
--
-- What this is:
--   A snapshot of the public schema of the production Supabase project
--   "mise_ai" (ref yjmprltzauajahmejaxi, Postgres 17), captured read-only on
--   2026-10-28 from pg_catalog. Tables, functions, policies, grants, realtime
--   publication membership, and reference data are all recorded here.
--
-- PRODUCTION: never run this file against production. The objects below
--   already exist there (they were created in the SQL editor before migration
--   tracking began). Production only needs this version marked as applied:
--     npx supabase migration repair --status applied 20261028150000
--   That step is run by a human, once. See docs/supabase-migrations.md.
--
-- Local and preview use: this file is idempotent. It applies to a fresh local
--   stack (auth schema, auth.uid(), and the anon / authenticated /
--   service_role roles already exist there) and can be applied twice in a row.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- EXTENSIONS
-- Supabase installs these in the "extensions" schema. pg_stat_statements,
-- supabase_vault, and plpgsql are Supabase-managed and are not created here.
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;


-- -----------------------------------------------------------------------------
-- TABLES
-- Dependency order: a table is created after any table it references.
-- Constraint and index names match production.
-- -----------------------------------------------------------------------------

-- Plan limits (config, not user data). Read by usage RPCs.
create table if not exists public.plan_entitlements (
  plan_key text not null,
  weekly_generate_limit integer,
  weekly_generate_soft_limit integer,
  weekly_generate_hard_limit integer,
  weekly_refine_limit integer,
  weekly_refine_soft_limit integer,
  weekly_refine_hard_limit integer,
  save_limit integer,
  per_minute_generate_limit integer,
  per_hour_generate_limit integer,
  per_minute_refine_limit integer,
  per_hour_refine_limit integer,
  weekly_token_soft_limit integer,
  weekly_token_hard_limit integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint plan_entitlements_pkey primary key (plan_key)
);

-- Ingredient reference data (config, not user data).
create table if not exists public.ingredient_unit_profiles (
  name_normalized text not null,
  canonical_unit text not null,
  grams_per_count numeric,
  ml_per_count numeric,
  pack_size_amount numeric,
  pack_size_unit text,
  display_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  exclude_always boolean default false not null,
  pantry_staple boolean default false not null,
  buy_unit_label text,
  constraint ingredient_unit_profiles_pkey primary key (name_normalized)
);

-- Email waitlist from the mobile announcement banner.
create table if not exists public.mobile_waitlist (
  id uuid default gen_random_uuid() not null,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  source text default 'announcement_banner'::text,
  constraint mobile_waitlist_pkey primary key (id),
  constraint mobile_waitlist_email_key unique (email)
);

create table if not exists public.recipes (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  title text not null,
  cuisine text,
  meal_type text,
  prep_time text,
  ingredients jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  instructions jsonb default '[]'::jsonb,
  cook_time text,
  protein text,
  servings integer default 2 not null,
  constraint recipes_pkey primary key (id),
  constraint recipes_servings_between_1_and_12 check (((servings >= 1) and (servings <= 12))),
  constraint recipes_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- Created after recipes so the FK to public.recipes(id) resolves.
create table if not exists public.weekly_plan (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  recipe_id uuid not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  week_start date default (date_trunc('week'::text, timezone('utc'::text, now())))::date not null,
  day_of_week smallint,
  meal_slot text,
  servings_override integer,
  cooked_at timestamp with time zone,
  constraint weekly_plan_pkey primary key (id),
  constraint weekly_plan_day_of_week_check check (((day_of_week is null) or ((day_of_week >= 0) and (day_of_week <= 6)))),
  constraint weekly_plan_meal_slot_check check (((meal_slot is null) or (meal_slot = any (array['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text])))),
  constraint weekly_plan_servings_override_check check (((servings_override is null) or ((servings_override >= 1) and (servings_override <= 12)))),
  constraint weekly_plan_recipe_id_fkey foreign key (recipe_id) references public.recipes(id) on delete cascade,
  constraint weekly_plan_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table if not exists public.grocery_list (
  id uuid default extensions.uuid_generate_v4() not null,
  user_id uuid not null,
  name text not null,
  amount numeric,
  unit text,
  category text,
  is_checked boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name_normalized text not null,
  source text default 'manual'::text not null,
  plan_week_start date,
  constraint grocery_list_pkey primary key (id),
  constraint grocery_list_source_check check ((source = any (array['manual'::text, 'plan'::text]))),
  constraint grocery_list_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table if not exists public.pantry_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  name_normalized text not null,
  amount numeric default 0 not null,
  unit text not null,
  category text,
  source text default 'manual'::text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint pantry_items_pkey primary key (id),
  constraint pantry_items_user_id_name_normalized_unit_key unique (user_id, name_normalized, unit),
  constraint pantry_items_amount_check check ((amount >= (0)::numeric)),
  constraint pantry_items_source_check check ((source = any (array['manual'::text, 'leftover'::text]))),
  constraint pantry_items_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

-- One row per user. Written by the Stripe webhook (service role).
create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  price_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  plan_key text,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_user_id_key unique (user_id),
  constraint subscriptions_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table if not exists public.user_settings (
  user_id uuid not null,
  timezone text default 'UTC'::text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  default_servings integer default 4 not null,
  dietary_preferences text[] default '{}'::text[] not null,
  disliked_ingredients text[] default '{}'::text[] not null,
  constraint user_settings_pkey primary key (user_id),
  constraint user_settings_default_servings_check check (((default_servings >= 1) and (default_servings <= 12))),
  constraint user_settings_user_id_fkey foreign key (user_id) references auth.users(id)
);

create table if not exists public.user_usage_counters (
  user_id uuid not null,
  scope text not null,
  window_start timestamp with time zone not null,
  count integer default 0 not null,
  tokens integer default 0 not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint user_usage_counters_pkey primary key (user_id, scope, window_start),
  constraint user_usage_counters_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- Indexes
create unique index if not exists grocery_list_user_name_norm_unit_unique on public.grocery_list using btree (user_id, name_normalized, unit);
create index if not exists grocery_list_plan_week_idx on public.grocery_list using btree (user_id, plan_week_start) where (source = 'plan'::text);
create index if not exists mobile_waitlist_email_idx on public.mobile_waitlist using btree (email);
create index if not exists pantry_items_user_id_idx on public.pantry_items using btree (user_id);
create unique index if not exists weekly_plan_user_week_slot_uidx on public.weekly_plan using btree (user_id, week_start, day_of_week, meal_slot) where ((day_of_week is not null) and (meal_slot is not null));
create index if not exists weekly_plan_user_week_idx on public.weekly_plan using btree (user_id, week_start);


-- -----------------------------------------------------------------------------
-- FUNCTIONS
-- Bodies are verbatim from production. Created after the tables they read,
-- because check_* and get_usage_status use %rowtype and table references.
-- All run with search_path = public, pg_temp. None is SECURITY DEFINER.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_and_increment_usage(p_user_id uuid, p_action text, p_request_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan_key text;  -- Renamed from plan_key to v_plan_key to avoid ambiguity
  ent public.plan_entitlements%rowtype;

  week_start timestamptz;
  reset_at timestamptz;

  scope_week text;
  scope_minute text;
  scope_hour text;

  limit_week_hard int;
  limit_week_soft int;
  limit_minute int;
  limit_hour int;

  new_week_count int;
  new_minute_count int;
  new_hour_count int;

  current_week_count int;
  current_week_tokens int;

  hard_token_limit int;
  soft_token_limit int;

  soft_limited boolean := false;
  reason text := null;
begin
  if p_action not in ('generate','refine') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_action');
  end if;

  v_plan_key := public.resolve_user_plan_key(p_user_id);

  select * into ent
  from public.plan_entitlements pe
  where pe.plan_key = v_plan_key;

  if not found then
    -- should not happen if seeded; fallback safely
    v_plan_key := 'free';
    select * into ent from public.plan_entitlements pe where pe.plan_key = v_plan_key;
  end if;

  week_start := public.resolve_week_window_start(p_user_id);
  reset_at := week_start + interval '1 week';

  if p_action = 'generate' then
    scope_week := 'week_generate';
    scope_minute := 'minute_generate';
    scope_hour := 'hour_generate';

    limit_week_hard := coalesce(ent.weekly_generate_hard_limit, ent.weekly_generate_limit);
    limit_week_soft := ent.weekly_generate_soft_limit;
    limit_minute := ent.per_minute_generate_limit;
    limit_hour := ent.per_hour_generate_limit;

    soft_token_limit := ent.weekly_token_soft_limit;
    hard_token_limit := ent.weekly_token_hard_limit;
  else
    scope_week := 'week_refine';
    scope_minute := 'minute_refine';
    scope_hour := 'hour_refine';

    limit_week_hard := coalesce(ent.weekly_refine_hard_limit, ent.weekly_refine_limit);
    limit_week_soft := ent.weekly_refine_soft_limit;
    limit_minute := ent.per_minute_refine_limit;
    limit_hour := ent.per_hour_refine_limit;

    soft_token_limit := ent.weekly_token_soft_limit;
    hard_token_limit := ent.weekly_token_hard_limit;
  end if;

  -- Token hard-stop precheck (based on accumulated tokens so far this week)
  select u.count, u.tokens into current_week_count, current_week_tokens
  from public.user_usage_counters u
  where u.user_id = p_user_id and u.scope = scope_week and u.window_start = week_start;

  current_week_count := coalesce(current_week_count, 0);
  current_week_tokens := coalesce(current_week_tokens, 0);

  if hard_token_limit is not null and current_week_tokens >= hard_token_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_token_hard_limit',
      'plan_key', v_plan_key,
      'reset_at', reset_at,
      'week_remaining', null
    );
  end if;

  -- Single subtransaction for atomic multi-bucket increments
  begin
    -- Week counter first (so per-minute/per-hour isn't consumed if week is blocked)
    new_week_count := public.try_increment_counter(p_user_id, scope_week, week_start, limit_week_hard);
    if new_week_count is null then
      raise exception using message = 'mise_blocked:weekly', errcode = 'P0001';
    end if;

    new_minute_count := public.try_increment_counter(p_user_id, scope_minute, date_trunc('minute', now()), limit_minute);
    if new_minute_count is null then
      raise exception using message = 'mise_blocked:per_minute', errcode = 'P0001';
    end if;

    new_hour_count := public.try_increment_counter(p_user_id, scope_hour, date_trunc('hour', now()), limit_hour);
    if new_hour_count is null then
      raise exception using message = 'mise_blocked:per_hour', errcode = 'P0001';
    end if;

  exception
    when others then
      if sqlerrm like 'mise_blocked:%' then
        reason := sqlerrm;
        return jsonb_build_object(
          'allowed', false,
          'reason', reason,
          'plan_key', v_plan_key,
          'reset_at', reset_at
        );
      end if;

      raise;
  end;

  -- Soft-limit flags
  if limit_week_soft is not null and new_week_count > limit_week_soft then
    soft_limited := true;
  end if;

  if soft_token_limit is not null and current_week_tokens >= soft_token_limit then
    soft_limited := true;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'plan_key', v_plan_key,
    'action', p_action,
    'week_count', new_week_count,
    'week_limit_hard', limit_week_hard,
    'week_limit_soft', limit_week_soft,
    'reset_at', reset_at,
    'soft_limited', soft_limited
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_usage_allowed(p_user_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan_key text;
  ent plan_entitlements%rowtype;

  week_start timestamptz;
  reset_at timestamptz;

  scope_week text;
  scope_minute text;
  scope_hour text;

  limit_week_hard int;
  limit_week_soft int;
  limit_minute int;
  limit_hour int;

  current_week_count int;
  current_minute_count int;
  current_hour_count int;
  current_week_tokens int;

  hard_token_limit int;
  soft_token_limit int;

  soft_limited boolean := false;
begin
  if p_action not in ('generate','refine') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_action');
  end if;

  v_plan_key := resolve_user_plan_key(p_user_id);

  select * into ent
  from plan_entitlements pe
  where pe.plan_key = v_plan_key;

  if not found then
    v_plan_key := 'free';
    select * into ent from plan_entitlements pe where pe.plan_key = v_plan_key;
  end if;

  week_start := resolve_week_window_start(p_user_id);
  reset_at := week_start + interval '1 week';

  if p_action = 'generate' then
    scope_week := 'week_generate';
    scope_minute := 'minute_generate';
    scope_hour := 'hour_generate';

    limit_week_hard := coalesce(ent.weekly_generate_hard_limit, ent.weekly_generate_limit);
    limit_week_soft := ent.weekly_generate_soft_limit;
    limit_minute := ent.per_minute_generate_limit;
    limit_hour := ent.per_hour_generate_limit;

    soft_token_limit := ent.weekly_token_soft_limit;
    hard_token_limit := ent.weekly_token_hard_limit;
  else
    scope_week := 'week_refine';
    scope_minute := 'minute_refine';
    scope_hour := 'hour_refine';

    limit_week_hard := coalesce(ent.weekly_refine_hard_limit, ent.weekly_refine_limit);
    limit_week_soft := ent.weekly_refine_soft_limit;
    limit_minute := ent.per_minute_refine_limit;
    limit_hour := ent.per_hour_refine_limit;

    soft_token_limit := ent.weekly_token_soft_limit;
    hard_token_limit := ent.weekly_token_hard_limit;
  end if;

  select u.count, u.tokens into current_week_count, current_week_tokens
  from user_usage_counters u
  where u.user_id = p_user_id and u.scope = scope_week and u.window_start = week_start;

  current_week_count := coalesce(current_week_count, 0);
  current_week_tokens := coalesce(current_week_tokens, 0);

  if hard_token_limit is not null and current_week_tokens >= hard_token_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_token_hard_limit',
      'plan_key', v_plan_key,
      'reset_at', reset_at,
      'week_remaining', null
    );
  end if;

  -- A null limit means unlimited, matching try_increment_counter.
  if limit_week_hard is not null and current_week_count >= limit_week_hard then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'mise_blocked:weekly',
      'plan_key', v_plan_key,
      'reset_at', reset_at
    );
  end if;

  select u.count into current_minute_count
  from user_usage_counters u
  where u.user_id = p_user_id and u.scope = scope_minute
    and u.window_start = date_trunc('minute', now());

  current_minute_count := coalesce(current_minute_count, 0);

  if limit_minute is not null and current_minute_count >= limit_minute then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'mise_blocked:per_minute',
      'plan_key', v_plan_key,
      'reset_at', reset_at
    );
  end if;

  select u.count into current_hour_count
  from user_usage_counters u
  where u.user_id = p_user_id and u.scope = scope_hour
    and u.window_start = date_trunc('hour', now());

  current_hour_count := coalesce(current_hour_count, 0);

  if limit_hour is not null and current_hour_count >= limit_hour then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'mise_blocked:per_hour',
      'plan_key', v_plan_key,
      'reset_at', reset_at
    );
  end if;

  -- Soft flags use the count this request would produce, as check_and_increment_usage does.
  if limit_week_soft is not null and current_week_count + 1 > limit_week_soft then
    soft_limited := true;
  end if;

  if soft_token_limit is not null and current_week_tokens >= soft_token_limit then
    soft_limited := true;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'plan_key', v_plan_key,
    'action', p_action,
    'week_count', current_week_count,
    'week_limit_hard', limit_week_hard,
    'week_limit_soft', limit_week_soft,
    'reset_at', reset_at,
    'soft_limited', soft_limited
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_saved_recipe_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan_key text;
  v_save_limit int;
  v_existing_count int;
begin
  v_plan_key := public.resolve_user_plan_key(new.user_id);

  select pe.save_limit into v_save_limit
  from public.plan_entitlements pe
  where pe.plan_key = v_plan_key;

  if v_save_limit is null then
    return new;
  end if;

  select count(*) into v_existing_count
  from public.recipes r
  where r.user_id = new.user_id;

  if v_existing_count >= v_save_limit then
    raise exception using
      message = 'mise_blocked:save_limit',
      detail = format('Save limit reached for plan=%s limit=%s', v_plan_key, v_save_limit),
      errcode = 'P0001';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_usage_status(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_plan_key text;
  v_week_start timestamp with time zone;
  v_reset_at timestamp with time zone;
  v_generate_count int;
  v_generate_tokens int;
  v_refine_count int;
  v_refine_tokens int;
  v_total_tokens int;
  v_generate_hard_limit int;
  v_generate_soft_limit int;
  v_refine_hard_limit int;
  v_refine_soft_limit int;
  v_weekly_token_soft_limit int;
  v_weekly_token_hard_limit int;
  v_soft_limited boolean;
begin
  -- Get user's plan key from subscription
  select s.plan_key into v_plan_key
  from subscriptions s
  where s.user_id = p_user_id;

  if v_plan_key is null then
    v_plan_key := 'free';
  end if;

  -- Get the week window start (Monday 00:00 in user's timezone)
  v_week_start := resolve_week_window_start(p_user_id);
  v_reset_at := v_week_start + interval '7 days';

  -- Count usage this week from weekly counters only
  select
    coalesce(max(case when scope = 'week_generate' then count else 0 end), 0),
    coalesce(max(case when scope = 'week_generate' then tokens else 0 end), 0),
    coalesce(max(case when scope = 'week_refine' then count else 0 end), 0),
    coalesce(max(case when scope = 'week_refine' then tokens else 0 end), 0)
  into v_generate_count, v_generate_tokens, v_refine_count, v_refine_tokens
  from user_usage_counters
  where user_id = p_user_id and window_start = v_week_start and scope in ('week_generate', 'week_refine');

  v_total_tokens := coalesce(v_generate_tokens, 0) + coalesce(v_refine_tokens, 0);

  -- Get plan entitlements
  select
    pe.weekly_generate_hard_limit,
    pe.weekly_generate_soft_limit,
    pe.weekly_refine_hard_limit,
    pe.weekly_refine_soft_limit,
    pe.weekly_token_soft_limit,
    pe.weekly_token_hard_limit
  into v_generate_hard_limit, v_generate_soft_limit, v_refine_hard_limit, v_refine_soft_limit, v_weekly_token_soft_limit, v_weekly_token_hard_limit
  from plan_entitlements pe
  where pe.plan_key = v_plan_key;

  v_soft_limited := (v_weekly_token_soft_limit is not null and v_total_tokens >= v_weekly_token_soft_limit);

  return json_build_object(
    'plan_key', v_plan_key,
    'week_start', v_week_start::text,
    'reset_at', v_reset_at::text,
    'generate', json_build_object(
      'count', v_generate_count,
      'remaining', case when v_generate_hard_limit is null then null else greatest(0, v_generate_hard_limit - v_generate_count) end,
      'hard_limit', v_generate_hard_limit,
      'soft_limit', v_generate_soft_limit,
      'tokens', v_generate_tokens
    ),
    'refine', json_build_object(
      'count', v_refine_count,
      'remaining', case when v_refine_hard_limit is null then null else greatest(0, v_refine_hard_limit - v_refine_count) end,
      'hard_limit', v_refine_hard_limit,
      'soft_limit', v_refine_soft_limit,
      'tokens', v_refine_tokens
    ),
    'weekly_tokens', json_build_object(
      'soft_limit', v_weekly_token_soft_limit,
      'hard_limit', v_weekly_token_hard_limit,
      'total_tokens', v_total_tokens
    ),
    'soft_limited', v_soft_limited
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_usage_tokens(p_user_id uuid, p_action text, p_tokens integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  week_start timestamptz;
  scope_week text;
  updated_tokens int;
begin
  if p_tokens is null or p_tokens <= 0 then
    return jsonb_build_object('ok', true, 'tokens_added', 0);
  end if;

  week_start := public.resolve_week_window_start(p_user_id);
  scope_week := case when p_action = 'refine' then 'week_refine' else 'week_generate' end;

  update public.user_usage_counters
  set tokens = tokens + p_tokens,
      updated_at = timezone('utc'::text, now())
  where user_id = p_user_id and scope = scope_week and window_start = week_start
  returning tokens into updated_tokens;

  if updated_tokens is null then
    -- If somehow missing (should be rare), create the row.
    insert into public.user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, scope_week, week_start, 0, p_tokens, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      tokens = public.user_usage_counters.tokens + excluded.tokens,
      updated_at = timezone('utc'::text, now())
    returning tokens into updated_tokens;
  end if;

  return jsonb_build_object('ok', true, 'tokens_total', updated_tokens);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_user_plan_key(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  pk text;
begin
  select coalesce(nullif(s.plan_key, ''), 'plus') into pk
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.status in ('active','trialing')
  limit 1;

  if pk is null then
    return 'free';
  end if;

  if pk not in ('free','plus','pro') then
    -- Unknown/legacy: treat as Plus (backward compatible, still bounded)
    return 'plus';
  end if;

  return pk;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_user_timezone(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  tz text;
begin
  select us.timezone into tz
  from public.user_settings us
  where us.user_id = p_user_id;

  if tz is null or length(tz) = 0 then
    tz := 'UTC';
  end if;

  -- Validate timezone by attempting a conversion. Fallback to UTC on errors.
  begin
    perform (now() at time zone tz);
  exception when others then
    tz := 'UTC';
  end;

  return tz;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_week_window_start(p_user_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  tz text;
  local_now timestamp;
  local_week_start timestamp;
  week_start_utc timestamptz;
begin
  tz := public.resolve_user_timezone(p_user_id);
  local_now := (now() at time zone tz);
  local_week_start := date_trunc('week', local_now);
  week_start_utc := (local_week_start at time zone tz);
  return week_start_utc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_plan_entitlements_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.try_increment_counter(p_user_id uuid, p_scope text, p_window_start timestamp with time zone, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_count int;
begin
  if p_limit is null then
    -- null means "unlimited" for this counter
    insert into public.user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, p_scope, p_window_start, 1, 0, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      count = public.user_usage_counters.count + 1,
      updated_at = timezone('utc'::text, now())
    returning count into new_count;

    return new_count;
  end if;

  if p_limit <= 0 then
    return null;
  end if;

  with upsert as (
    insert into public.user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, p_scope, p_window_start, 1, 0, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      count = public.user_usage_counters.count + 1,
      updated_at = timezone('utc'::text, now())
    where public.user_usage_counters.count < p_limit
    returning count
  )
  select count into new_count from upsert;

  return new_count;
end;
$function$
;


-- -----------------------------------------------------------------------------
-- TRIGGERS
-- Captured from prod with pg_get_triggerdef (names, timing and events match).
-- -----------------------------------------------------------------------------

drop trigger if exists recipes_enforce_saved_recipe_limit on public.recipes;
create trigger recipes_enforce_saved_recipe_limit
  before insert on public.recipes
  for each row execute function public.enforce_saved_recipe_limit();

drop trigger if exists plan_entitlements_set_updated_at on public.plan_entitlements;
create trigger plan_entitlements_set_updated_at
  before update on public.plan_entitlements
  for each row execute function public.set_plan_entitlements_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_user_settings_updated_at();


-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- RLS is enabled (not forced) on all 10 tables. Policies match production:
-- same name, command, roles, and USING / WITH CHECK expressions.
-- -----------------------------------------------------------------------------

alter table public.grocery_list enable row level security;
alter table public.ingredient_unit_profiles enable row level security;
alter table public.mobile_waitlist enable row level security;
alter table public.pantry_items enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.recipes enable row level security;
alter table public.subscriptions enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_usage_counters enable row level security;
alter table public.weekly_plan enable row level security;

drop policy if exists "Users can delete their own grocery list" on public.grocery_list;
create policy "Users can delete their own grocery list" on public.grocery_list as permissive for delete to public using ((auth.uid() = user_id));
drop policy if exists "Users can insert their own grocery list" on public.grocery_list;
create policy "Users can insert their own grocery list" on public.grocery_list as permissive for insert to public with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own grocery list" on public.grocery_list;
create policy "Users can update their own grocery list" on public.grocery_list as permissive for update to public using ((auth.uid() = user_id));
drop policy if exists "Users can view their own grocery list" on public.grocery_list;
create policy "Users can view their own grocery list" on public.grocery_list as permissive for select to authenticated using ((auth.uid() = user_id));

drop policy if exists ingredient_unit_profiles_select_authenticated on public.ingredient_unit_profiles;
create policy ingredient_unit_profiles_select_authenticated on public.ingredient_unit_profiles as permissive for select to authenticated using (true);

drop policy if exists "Anyone can sign up for waitlist" on public.mobile_waitlist;
create policy "Anyone can sign up for waitlist" on public.mobile_waitlist as permissive for insert to anon, authenticated with check (true);
drop policy if exists "Users cannot read waitlist" on public.mobile_waitlist;
create policy "Users cannot read waitlist" on public.mobile_waitlist as permissive for select to public using (false);

drop policy if exists "Users can delete their own pantry" on public.pantry_items;
create policy "Users can delete their own pantry" on public.pantry_items as permissive for delete to public using ((auth.uid() = user_id));
drop policy if exists "Users can insert their own pantry" on public.pantry_items;
create policy "Users can insert their own pantry" on public.pantry_items as permissive for insert to public with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own pantry" on public.pantry_items;
create policy "Users can update their own pantry" on public.pantry_items as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "Users can view their own pantry" on public.pantry_items;
create policy "Users can view their own pantry" on public.pantry_items as permissive for select to public using ((auth.uid() = user_id));

drop policy if exists "Allow anon to read plan entitlements" on public.plan_entitlements;
create policy "Allow anon to read plan entitlements" on public.plan_entitlements as permissive for select to anon using (true);
drop policy if exists "Allow authenticated users to read plan entitlements" on public.plan_entitlements;
create policy "Allow authenticated users to read plan entitlements" on public.plan_entitlements as permissive for select to authenticated using (true);

drop policy if exists "Users can delete their own recipes" on public.recipes;
create policy "Users can delete their own recipes" on public.recipes as permissive for delete to authenticated using ((auth.uid() = user_id));
drop policy if exists "Users can insert their own recipes" on public.recipes;
create policy "Users can insert their own recipes" on public.recipes as permissive for insert to authenticated with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own recipes" on public.recipes;
create policy "Users can update their own recipes" on public.recipes as permissive for update to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "Users can view their own recipes" on public.recipes;
create policy "Users can view their own recipes" on public.recipes as permissive for select to authenticated using ((auth.uid() = user_id));

drop policy if exists "Users can view their own subscription" on public.subscriptions;
create policy "Users can view their own subscription" on public.subscriptions as permissive for select to public using ((auth.uid() = user_id));

drop policy if exists "Users can read own settings" on public.user_settings;
create policy "Users can read own settings" on public.user_settings as permissive for select to public using ((auth.uid() = user_id));
drop policy if exists "Users can update own settings" on public.user_settings;
create policy "Users can update own settings" on public.user_settings as permissive for update to public using ((auth.uid() = user_id));
drop policy if exists "Users can upsert own settings" on public.user_settings;
create policy "Users can upsert own settings" on public.user_settings as permissive for insert to public with check ((auth.uid() = user_id));

drop policy if exists "Users can read own usage counters" on public.user_usage_counters;
create policy "Users can read own usage counters" on public.user_usage_counters as permissive for select to public using ((auth.uid() = user_id));

drop policy if exists "Users can delete from their own weekly plan" on public.weekly_plan;
create policy "Users can delete from their own weekly plan" on public.weekly_plan as permissive for delete to public using ((auth.uid() = user_id));
drop policy if exists "Users can insert into their own weekly plan" on public.weekly_plan;
create policy "Users can insert into their own weekly plan" on public.weekly_plan as permissive for insert to public with check ((auth.uid() = user_id));
drop policy if exists "Users can update their own weekly plan" on public.weekly_plan;
create policy "Users can update their own weekly plan" on public.weekly_plan as permissive for update to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
drop policy if exists "Users can view their own weekly plan" on public.weekly_plan;
create policy "Users can view their own weekly plan" on public.weekly_plan as permissive for select to authenticated using ((auth.uid() = user_id));


-- -----------------------------------------------------------------------------
-- GRANTS
-- Table privileges match production (Supabase defaults) for anon,
-- authenticated, and service_role. RLS, not grants, limits row access.
-- Function EXECUTE is PUBLIC by default in production, except
-- check_usage_allowed, which is restricted to service_role below.
-- -----------------------------------------------------------------------------

grant all on table public.grocery_list to anon, authenticated, service_role;
grant all on table public.ingredient_unit_profiles to anon, authenticated, service_role;
grant all on table public.mobile_waitlist to anon, authenticated, service_role;
grant all on table public.pantry_items to anon, authenticated, service_role;
grant all on table public.plan_entitlements to anon, authenticated, service_role;
grant all on table public.recipes to anon, authenticated, service_role;
grant all on table public.subscriptions to anon, authenticated, service_role;
grant all on table public.user_settings to anon, authenticated, service_role;
grant all on table public.user_usage_counters to anon, authenticated, service_role;
grant all on table public.weekly_plan to anon, authenticated, service_role;

revoke execute on function public.check_usage_allowed(uuid, text) from public, anon, authenticated;
grant execute on function public.check_usage_allowed(uuid, text) to service_role;


-- -----------------------------------------------------------------------------
-- REALTIME
-- Adds the four tables to the supabase_realtime publication, if absent.
-- Replica identity stays at the default for all tables.
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['grocery_list', 'pantry_items', 'recipes', 'weekly_plan'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- REFERENCE DATA (config, not user data)
-- Inserts do nothing on conflict, so existing rows are never changed.
-- created_at and updated_at are left to their defaults.
-- -----------------------------------------------------------------------------

insert into public.plan_entitlements (
  plan_key,
  weekly_generate_limit, weekly_generate_soft_limit, weekly_generate_hard_limit,
  weekly_refine_limit, weekly_refine_soft_limit, weekly_refine_hard_limit,
  save_limit,
  per_minute_generate_limit, per_hour_generate_limit,
  per_minute_refine_limit, per_hour_refine_limit,
  weekly_token_soft_limit, weekly_token_hard_limit
) values
  ('free', 5, null, 5, 10, null, 10, 20, 1, 10, 2, 30, 50000, 50000),
  ('plus', 100, null, 100, 100, null, 100, 200, 2, 30, 4, 60, 500000, 500000),
  ('pro', null, 500, 1500, null, 500, 3000, 2000, 5, 120, 10, 240, 2000000, 5000000)
on conflict (plan_key) do nothing;

insert into public.ingredient_unit_profiles (
  name_normalized, canonical_unit, grams_per_count, ml_per_count,
  pack_size_amount, pack_size_unit, display_name,
  exclude_always, pantry_staple, buy_unit_label
) values
  ('active dry yeast', 'tsp', null, null, null, null, 'Active dry yeast', false, true, 'packet'),
  ('all-purpose flour', 'cup', null, null, null, null, 'All-purpose flour', false, true, 'bag'),
  ('apple cider vinegar', 'ml', null, null, 500, 'ml', 'Apple cider vinegar', false, true, 'bottle'),
  ('baking powder', 'tsp', null, null, null, null, 'Baking powder', false, true, 'container'),
  ('baking soda', 'tsp', null, null, null, null, 'Baking soda', false, true, 'container'),
  ('balsamic vinegar', 'ml', null, null, 500, 'ml', 'Balsamic vinegar', false, true, 'bottle'),
  ('bay leaf', 'count', null, null, null, null, 'Bay leaves', false, true, 'container'),
  ('bell pepper', 'count', 160, null, null, null, 'Bell peppers', false, false, null),
  ('black beans', 'count', null, null, null, null, 'Black beans', false, true, 'can'),
  ('black pepper', 'tsp', null, null, null, null, 'Black pepper', false, true, 'container'),
  ('breadcrumbs', 'cup', null, null, null, null, 'Breadcrumbs', false, true, 'container'),
  ('brown sugar', 'cup', null, null, null, null, 'Brown sugar', false, true, 'bag'),
  ('canned tomatoes', 'count', null, null, null, null, 'Canned tomatoes', false, true, 'can'),
  ('canola oil', 'ml', null, null, 1000, 'ml', 'Canola oil', false, true, 'bottle'),
  ('carrot', 'count', 70, null, null, null, 'Carrots', false, false, null),
  ('cayenne pepper', 'tsp', null, null, null, null, 'Cayenne pepper', false, true, 'container'),
  ('celery', 'count', 100, null, null, null, 'Celery', false, false, null),
  ('chicken breast', 'lb', null, null, 1, 'lb', 'Chicken breast', false, false, null),
  ('chicken broth', 'ml', null, null, 1000, 'ml', 'Chicken broth', false, true, 'carton'),
  ('chicken thigh', 'lb', null, null, 1, 'lb', 'Chicken thighs', false, false, null),
  ('chickpeas', 'count', null, null, null, null, 'Chickpeas', false, true, 'can'),
  ('chili powder', 'tsp', null, null, null, null, 'Chili powder', false, true, 'container'),
  ('cinnamon', 'tsp', null, null, null, null, 'Ground cinnamon', false, true, 'container'),
  ('coconut milk', 'count', null, null, null, null, 'Coconut milk', false, true, 'can'),
  ('cornstarch', 'tbsp', null, null, null, null, 'Cornstarch', false, true, 'box'),
  ('cumin', 'tsp', null, null, null, null, 'Ground cumin', false, true, 'container'),
  ('curry powder', 'tsp', null, null, null, null, 'Curry powder', false, true, 'container'),
  ('dried basil', 'tsp', null, null, null, null, 'Dried basil', false, true, 'container'),
  ('dried oregano', 'tsp', null, null, null, null, 'Dried oregano', false, true, 'container'),
  ('dried thyme', 'tsp', null, null, null, null, 'Dried thyme', false, true, 'container'),
  ('flour', 'cup', null, null, null, null, 'All-purpose flour', false, true, 'bag'),
  ('garlic', 'clove', null, null, null, null, 'Garlic', false, false, null),
  ('garlic powder', 'tsp', null, null, null, null, 'Garlic powder', false, true, 'container'),
  ('granulated sugar', 'cup', null, null, null, null, 'Granulated sugar', false, true, 'bag'),
  ('ground beef', 'lb', null, null, 1, 'lb', 'Ground beef', false, false, null),
  ('ground black pepper', 'tsp', null, null, null, null, 'Ground black pepper', false, true, 'container'),
  ('ground chicken', 'lb', null, null, 1, 'lb', 'Ground chicken', false, false, null),
  ('ground cinnamon', 'tsp', null, null, null, null, 'Ground cinnamon', false, true, 'container'),
  ('ground cumin', 'tsp', null, null, null, null, 'Ground cumin', false, true, 'container'),
  ('ground nutmeg', 'tsp', null, null, null, null, 'Ground nutmeg', false, true, 'container'),
  ('ground turkey', 'lb', null, null, 1, 'lb', 'Ground turkey', false, false, null),
  ('honey', 'tbsp', null, null, null, null, 'Honey', false, true, 'jar'),
  ('hot sauce', 'ml', null, null, 150, 'ml', 'Hot sauce', false, true, 'bottle'),
  ('italian seasoning', 'tsp', null, null, null, null, 'Italian seasoning', false, true, 'container'),
  ('kidney beans', 'count', null, null, null, null, 'Kidney beans', false, true, 'can'),
  ('kosher salt', 'tsp', null, null, null, null, 'Kosher salt', false, true, 'container'),
  ('lemon', 'count', 60, null, null, null, 'Lemons', false, false, null),
  ('lime', 'count', 50, null, null, null, 'Limes', false, false, null),
  ('maple syrup', 'tbsp', null, null, null, null, 'Maple syrup', false, true, 'bottle'),
  ('neutral cooking oil', 'ml', null, null, 1000, 'ml', 'Cooking oil', false, false, 'bottle'),
  ('olive oil', 'ml', null, null, 1000, 'ml', 'Olive oil', false, true, 'bottle'),
  ('onion', 'count', 150, null, null, null, 'Onions', false, false, null),
  ('onion powder', 'tsp', null, null, null, null, 'Onion powder', false, true, 'container'),
  ('oregano', 'tsp', null, null, null, null, 'Dried oregano', false, true, 'container'),
  ('paprika', 'tsp', null, null, null, null, 'Paprika', false, true, 'container'),
  ('pasta', 'oz', null, null, null, null, 'Pasta', false, true, 'box'),
  ('pepper', 'tsp', null, null, null, null, 'Black pepper', false, true, 'container'),
  ('potato', 'count', 200, null, null, null, 'Potatoes', false, false, null),
  ('red pepper flakes', 'tsp', null, null, null, null, 'Red pepper flakes', false, true, 'container'),
  ('rice', 'cup', null, null, null, null, 'Rice', false, true, 'bag'),
  ('rice vinegar', 'ml', null, null, 500, 'ml', 'Rice vinegar', false, true, 'bottle'),
  ('rosemary', 'tsp', null, null, null, null, 'Dried rosemary', false, true, 'container'),
  ('salt', 'tsp', null, null, null, null, 'Salt', false, true, 'container'),
  ('sea salt', 'tsp', null, null, null, null, 'Sea salt', false, true, 'container'),
  ('sesame oil', 'ml', null, null, 250, 'ml', 'Sesame oil', false, true, 'bottle'),
  ('smoked paprika', 'tsp', null, null, null, null, 'Smoked paprika', false, true, 'container'),
  ('soy sauce', 'ml', null, null, 500, 'ml', 'Soy sauce', false, true, 'bottle'),
  ('sugar', 'cup', null, null, null, null, 'Granulated sugar', false, true, 'bag'),
  ('table salt', 'tsp', null, null, null, null, 'Table salt', false, true, 'container'),
  ('thyme', 'tsp', null, null, null, null, 'Dried thyme', false, true, 'container'),
  ('tomato', 'count', 120, null, null, null, 'Tomatoes', false, false, null),
  ('tomato paste', 'count', null, null, null, null, 'Tomato paste', false, true, 'can'),
  ('tomato sauce', 'count', null, null, null, null, 'Tomato sauce', false, true, 'can'),
  ('turmeric', 'tsp', null, null, null, null, 'Turmeric', false, true, 'container'),
  ('vanilla extract', 'tsp', null, null, null, null, 'Vanilla extract', false, true, 'bottle'),
  ('vegetable broth', 'ml', null, null, 1000, 'ml', 'Vegetable broth', false, true, 'carton'),
  ('vegetable oil', 'ml', null, null, 1000, 'ml', 'Vegetable oil', false, true, 'bottle'),
  ('vinegar', 'ml', null, null, 500, 'ml', 'Vinegar', false, false, 'bottle'),
  ('water', 'ml', null, null, null, null, 'Water', true, false, null),
  ('white pepper', 'tsp', null, null, null, null, 'White pepper', false, true, 'container'),
  ('white vinegar', 'ml', null, null, 500, 'ml', 'White vinegar', false, true, 'bottle'),
  ('worcestershire sauce', 'ml', null, null, 300, 'ml', 'Worcestershire sauce', false, true, 'bottle'),
  ('yeast', 'tsp', null, null, null, null, 'Yeast', false, true, 'packet'),
  ('yellow onion', 'count', 150, null, null, null, 'Yellow onions', false, false, null)
on conflict (name_normalized) do nothing;
