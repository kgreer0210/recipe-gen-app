-- =====================================================
-- Tiered Usage Tracking Schema for Mise AI
-- =====================================================
-- This file documents the deployed usage tracking system.
-- The actual migration is managed via Supabase migrations.
-- See: tiered_usage_model (20260115225301)
-- =====================================================

-- 1. Plan Entitlements Table
-- Stores limits for each plan tier (free/plus/pro)
create table if not exists plan_entitlements (
  plan_key text primary key,
  weekly_generate_limit int,
  weekly_generate_soft_limit int,
  weekly_generate_hard_limit int,
  weekly_refine_limit int,
  weekly_refine_soft_limit int,
  weekly_refine_hard_limit int,
  save_limit int,
  per_minute_generate_limit int,
  per_hour_generate_limit int,
  per_minute_refine_limit int,
  per_hour_refine_limit int,
  weekly_token_soft_limit int,
  weekly_token_hard_limit int,
  created_at timestamptz default timezone('utc'::text, now()),
  updated_at timestamptz default timezone('utc'::text, now())
);

alter table plan_entitlements enable row level security;

create policy "Allow authenticated users to read plan entitlements"
  on plan_entitlements for select to authenticated using (true);

create policy "Allow anon to read plan entitlements"
  on plan_entitlements for select to anon using (true);

-- Seed plan entitlements data
insert into plan_entitlements (plan_key, weekly_generate_limit, weekly_generate_hard_limit, weekly_refine_limit, weekly_refine_hard_limit, save_limit, per_minute_generate_limit, per_hour_generate_limit, per_minute_refine_limit, per_hour_refine_limit, weekly_token_soft_limit, weekly_token_hard_limit) values
  ('free', 5, 5, 10, 10, 20, 1, 10, 2, 30, 50000, 50000),
  ('plus', 100, 100, 100, 100, 200, 2, 30, 4, 60, 500000, 500000),
  ('pro', null, 1500, null, 3000, 2000, 5, 120, 10, 240, 2000000, 5000000)
on conflict (plan_key) do nothing;

-- Pro plan has soft limits stored separately
update plan_entitlements 
set weekly_generate_soft_limit = 500, weekly_refine_soft_limit = 500 
where plan_key = 'pro';


-- 2. User Usage Counters Table
-- Tracks usage per user, per scope (week_generate, minute_generate, etc.), per window
create table if not exists user_usage_counters (
  user_id uuid references auth.users(id) on delete cascade not null,
  scope text not null,
  window_start timestamptz not null,
  count int default 0,
  tokens int default 0,
  updated_at timestamptz default timezone('utc'::text, now()),
  primary key (user_id, scope, window_start)
);

alter table user_usage_counters enable row level security;

create policy "Users can read their own usage counters"
  on user_usage_counters for select using (auth.uid() = user_id);

create index if not exists user_usage_counters_user_scope_idx 
  on user_usage_counters(user_id, scope, window_start);


-- 3. Helper Function: resolve_user_timezone
-- Gets user's timezone from user_settings, defaults to UTC
create or replace function resolve_user_timezone(p_user_id uuid)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  tz text;
begin
  select us.timezone into tz
  from user_settings us
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
$$;


-- 4. Helper Function: resolve_week_window_start
-- Calculates the Monday 00:00 of the current week in user's timezone
create or replace function resolve_week_window_start(p_user_id uuid)
returns timestamptz
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  tz text;
  local_now timestamp;
  local_week_start timestamp;
  week_start_utc timestamptz;
begin
  tz := resolve_user_timezone(p_user_id);
  local_now := (now() at time zone tz);
  local_week_start := date_trunc('week', local_now);
  week_start_utc := (local_week_start at time zone tz);
  return week_start_utc;
end;
$$;


-- 5. Helper Function: resolve_user_plan_key
-- Determines user's plan from subscriptions table
create or replace function resolve_user_plan_key(p_user_id uuid)
returns text
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  pk text;
begin
  select coalesce(nullif(s.plan_key, ''), 'plus') into pk
  from subscriptions s
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
$$;


-- 6. Helper Function: try_increment_counter
-- Atomically increments a counter, returns null if limit exceeded
create or replace function try_increment_counter(
  p_user_id uuid,
  p_scope text,
  p_window_start timestamptz,
  p_limit int
)
returns int
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  new_count int;
begin
  if p_limit is null then
    -- null means "unlimited" for this counter
    insert into user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, p_scope, p_window_start, 1, 0, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      count = user_usage_counters.count + 1,
      updated_at = timezone('utc'::text, now())
    returning count into new_count;

    return new_count;
  end if;

  if p_limit <= 0 then
    return null;
  end if;

  with upsert as (
    insert into user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, p_scope, p_window_start, 1, 0, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      count = user_usage_counters.count + 1,
      updated_at = timezone('utc'::text, now())
    where user_usage_counters.count < p_limit
    returning count
  )
  select count into new_count from upsert;

  return new_count;
end;
$$;


-- 7. RPC: check_and_increment_usage
-- Main function called before AI requests to check and increment usage atomically
create or replace function check_and_increment_usage(
  p_user_id uuid,
  p_action text,
  p_request_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
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

  -- Token hard-stop precheck
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

  -- Atomic multi-bucket increments
  begin
    new_week_count := try_increment_counter(p_user_id, scope_week, week_start, limit_week_hard);
    if new_week_count is null then
      raise exception using message = 'mise_blocked:weekly', errcode = 'P0001';
    end if;

    new_minute_count := try_increment_counter(p_user_id, scope_minute, date_trunc('minute', now()), limit_minute);
    if new_minute_count is null then
      raise exception using message = 'mise_blocked:per_minute', errcode = 'P0001';
    end if;

    new_hour_count := try_increment_counter(p_user_id, scope_hour, date_trunc('hour', now()), limit_hour);
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
$$;


-- 8. RPC: record_usage_tokens
-- Called after AI requests to record token usage
create or replace function record_usage_tokens(
  p_user_id uuid,
  p_action text,
  p_tokens int
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  week_start timestamptz;
  scope_week text;
  updated_tokens int;
begin
  if p_tokens is null or p_tokens <= 0 then
    return jsonb_build_object('ok', true, 'tokens_added', 0);
  end if;

  week_start := resolve_week_window_start(p_user_id);
  scope_week := case when p_action = 'refine' then 'week_refine' else 'week_generate' end;

  update user_usage_counters
  set tokens = tokens + p_tokens,
      updated_at = timezone('utc'::text, now())
  where user_id = p_user_id and scope = scope_week and window_start = week_start
  returning tokens into updated_tokens;

  if updated_tokens is null then
    insert into user_usage_counters(user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, scope_week, week_start, 0, p_tokens, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      tokens = user_usage_counters.tokens + excluded.tokens,
      updated_at = timezone('utc'::text, now())
    returning tokens into updated_tokens;
  end if;

  return jsonb_build_object('ok', true, 'tokens_total', updated_tokens);
end;
$$;


-- 9. RPC: get_usage_status
-- Returns current usage status for display in UI
create or replace function get_usage_status(p_user_id uuid)
returns json
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v_plan_key text;
  v_week_start timestamptz;
  v_reset_at timestamptz;
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
  select s.plan_key into v_plan_key
  from subscriptions s
  where s.user_id = p_user_id;
  
  if v_plan_key is null then
    v_plan_key := 'free';
  end if;
  
  v_week_start := resolve_week_window_start(p_user_id);
  v_reset_at := v_week_start + interval '7 days';
  
  select 
    coalesce(max(case when scope = 'week_generate' then count else 0 end), 0),
    coalesce(max(case when scope = 'week_generate' then tokens else 0 end), 0),
    coalesce(max(case when scope = 'week_refine' then count else 0 end), 0),
    coalesce(max(case when scope = 'week_refine' then tokens else 0 end), 0)
  into v_generate_count, v_generate_tokens, v_refine_count, v_refine_tokens
  from user_usage_counters
  where user_id = p_user_id and window_start = v_week_start and scope in ('week_generate', 'week_refine');
  
  v_total_tokens := coalesce(v_generate_tokens, 0) + coalesce(v_refine_tokens, 0);
  
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
$$;


-- 10. Saved Recipe Limit Enforcement Trigger
create or replace function enforce_saved_recipe_limit()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_plan_key text;
  save_limit int;
  existing_count int;
begin
  v_plan_key := resolve_user_plan_key(new.user_id);

  select pe.save_limit into save_limit
  from plan_entitlements pe
  where pe.plan_key = v_plan_key;

  if save_limit is null then
    return new;
  end if;

  select count(*) into existing_count
  from recipes r
  where r.user_id = new.user_id;

  if existing_count >= save_limit then
    raise exception using
      message = 'mise_blocked:save_limit',
      detail = format('Save limit reached for plan=%s limit=%s', v_plan_key, save_limit),
      errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger recipes_enforce_saved_recipe_limit
  before insert on recipes
  for each row
  execute function enforce_saved_recipe_limit();
