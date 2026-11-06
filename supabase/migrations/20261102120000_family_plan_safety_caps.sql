-- =============================================================================
-- Family plan: one plan for every account, with safety caps.
--
-- Applies after 20261028180000_busy_week_atomic. Idempotent (on conflict do
-- update, create or replace), so it can run twice.
--
-- Mise AI becomes a private family app with no payments. Every account resolves
-- to the `family` plan. The caps below are cost guards, not product tiers.
--
-- ROLLBACK: the free, plus and pro rows in plan_entitlements and the whole
-- subscriptions table are left in place, so going back is a function swap:
--   1. Re-create public.resolve_user_plan_key with its body from
--      20261028150000_baseline.sql (it reads subscriptions again).
--   2. Re-create public.reserve_usage with its body from
--      20261028170000_busy_week_usage.sql. That puts back the free-plan
--      paid_plan_required check, which this migration drops.
-- get_usage_status can stay as it is: it calls the resolver. Nothing here
-- changes data except the `family` row in plan_entitlements.
--
-- Functions that already go through resolve_user_plan_key need no change and are
-- not touched here: check_and_increment_usage, check_usage_allowed and
-- enforce_saved_recipe_limit (the save_limit trigger), plus begin_busy_week_batch
-- and settle_busy_week_batch, which only call reserve_usage. The admin bypass
-- lives in app code (ADMIN_USER_ID), not in SQL, so it is unchanged.
--
-- Do not run this against production without Kyle's go-ahead.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- The family plan row.
--   weekly:  150 recipes, 300 refinements (limit = hard limit, no soft limit)
--   burst:   10 a minute, 60 an hour, for both generate and refine
--   tokens:  warn at 500,000, stop at 1,000,000 a week
--   saves:   null = no cap (enforce_saved_recipe_limit returns early on null)
-- Chef's Week has no column. reserve_usage allows it for any plan that has a row.
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
  ('family', 150, null, 150, 300, null, 300, null, 10, 60, 10, 60, 500000, 1000000)
on conflict (plan_key) do update set
  weekly_generate_limit = excluded.weekly_generate_limit,
  weekly_generate_soft_limit = excluded.weekly_generate_soft_limit,
  weekly_generate_hard_limit = excluded.weekly_generate_hard_limit,
  weekly_refine_limit = excluded.weekly_refine_limit,
  weekly_refine_soft_limit = excluded.weekly_refine_soft_limit,
  weekly_refine_hard_limit = excluded.weekly_refine_hard_limit,
  save_limit = excluded.save_limit,
  per_minute_generate_limit = excluded.per_minute_generate_limit,
  per_hour_generate_limit = excluded.per_hour_generate_limit,
  per_minute_refine_limit = excluded.per_minute_refine_limit,
  per_hour_refine_limit = excluded.per_hour_refine_limit,
  weekly_token_soft_limit = excluded.weekly_token_soft_limit,
  weekly_token_hard_limit = excluded.weekly_token_hard_limit;


-- -----------------------------------------------------------------------------
-- resolve_user_plan_key: every account is on the family plan. subscriptions is
-- no longer read. Same signature, language and search_path as the baseline.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_user_plan_key(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return 'family';
end;
$function$
;


-- -----------------------------------------------------------------------------
-- get_usage_status: read the plan from the resolver instead of subscriptions.
-- Otherwise identical to the baseline.
-- -----------------------------------------------------------------------------
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
  -- Same resolver the enforcement functions use, so status and limits agree.
  v_plan_key := public.resolve_user_plan_key(p_user_id);

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


-- -----------------------------------------------------------------------------
-- reserve_usage: Chef's Week no longer needs a paid plan, so the free-plan
-- paid_plan_required check is gone. Otherwise identical to 20261028170000.
-- Grants are repeated so the function ends with the same access as before.
-- -----------------------------------------------------------------------------
create or replace function public.reserve_usage(p_user_id uuid, p_action text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_plan_key text;
  ent public.plan_entitlements%rowtype;

  v_week_start timestamptz;
  v_reset_at timestamptz;

  v_limit_week_hard integer;
  v_limit_week_soft integer;

  v_new_week_count integer;
  v_current_week_count integer;
  v_current_week_tokens integer;
  v_recipe_count integer;
  v_remaining integer;
  v_soft_limited boolean := false;
begin
  if p_action is distinct from 'generate' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_action');
  end if;

  if p_count is null or p_count < 1 or p_count > 7 then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_count');
  end if;

  v_plan_key := public.resolve_user_plan_key(p_user_id);

  select * into ent
  from public.plan_entitlements pe
  where pe.plan_key = v_plan_key;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'plan_not_configured', 'plan_key', v_plan_key);
  end if;

  v_week_start := public.resolve_week_window_start(p_user_id);
  v_reset_at := v_week_start + interval '1 week';

  v_limit_week_hard := coalesce(ent.weekly_generate_hard_limit, ent.weekly_generate_limit);
  v_limit_week_soft := ent.weekly_generate_soft_limit;

  select u.count, u.tokens into v_current_week_count, v_current_week_tokens
  from public.user_usage_counters u
  where u.user_id = p_user_id
    and u.scope = 'week_generate'
    and u.window_start = v_week_start;

  v_current_week_count := coalesce(v_current_week_count, 0);
  v_current_week_tokens := coalesce(v_current_week_tokens, 0);

  -- Same token hard-stop as check_and_increment_usage.
  if ent.weekly_token_hard_limit is not null and v_current_week_tokens >= ent.weekly_token_hard_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'weekly_token_hard_limit',
      'plan_key', v_plan_key,
      'reset_at', v_reset_at,
      'remaining', null
    );
  end if;

  -- The whole batch must fit, or nothing is reserved.
  if v_limit_week_hard is not null then
    v_remaining := greatest(v_limit_week_hard - v_current_week_count, 0);
    if p_count > v_remaining then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'insufficient_remaining',
        'plan_key', v_plan_key,
        'reset_at', v_reset_at,
        'remaining', v_remaining,
        'window_start', v_week_start
      );
    end if;
  end if;

  -- Save-limit pre-check. The recipes insert trigger stays authoritative.
  if ent.save_limit is not null then
    select count(*) into v_recipe_count
    from public.recipes r
    where r.user_id = p_user_id;

    if v_recipe_count + p_count > ent.save_limit then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'save_limit',
        'plan_key', v_plan_key,
        'reset_at', v_reset_at,
        'remaining', greatest(ent.save_limit - v_recipe_count, 0),
        'window_start', v_week_start
      );
    end if;
  end if;

  -- Week bucket first, then burst buckets. Any block raises inside this block,
  -- which rolls back the week increment too, so nothing is partially reserved.
  begin
    insert into public.user_usage_counters (user_id, scope, window_start, count, tokens, updated_at)
    values (p_user_id, 'week_generate', v_week_start, p_count, 0, timezone('utc'::text, now()))
    on conflict (user_id, scope, window_start)
    do update set
      count = public.user_usage_counters.count + excluded.count,
      updated_at = timezone('utc'::text, now())
    where v_limit_week_hard is null
       or public.user_usage_counters.count + excluded.count <= v_limit_week_hard
    returning count into v_new_week_count;

    if v_new_week_count is null then
      raise exception using message = 'mise_blocked:weekly', errcode = 'P0001';
    end if;

    -- A batch is one burst request (Q2), however many dinners it has.
    if public.try_increment_counter(p_user_id, 'minute_generate', date_trunc('minute', now()), ent.per_minute_generate_limit) is null then
      raise exception using message = 'mise_blocked:per_minute', errcode = 'P0001';
    end if;

    if public.try_increment_counter(p_user_id, 'hour_generate', date_trunc('hour', now()), ent.per_hour_generate_limit) is null then
      raise exception using message = 'mise_blocked:per_hour', errcode = 'P0001';
    end if;
  exception
    when others then
      if sqlerrm like 'mise_blocked:%' then
        -- A lost race on the weekly bucket is the same answer as the up-front check.
        return jsonb_build_object(
          'allowed', false,
          'reason', case when sqlerrm = 'mise_blocked:weekly' then 'insufficient_remaining' else sqlerrm end,
          'plan_key', v_plan_key,
          'reset_at', v_reset_at,
          'remaining', case when v_limit_week_hard is null then null
                            else greatest(v_limit_week_hard - v_current_week_count, 0) end,
          'window_start', v_week_start
        );
      end if;
      raise;
  end;

  if v_limit_week_soft is not null and v_new_week_count > v_limit_week_soft then
    v_soft_limited := true;
  end if;

  if ent.weekly_token_soft_limit is not null and v_current_week_tokens >= ent.weekly_token_soft_limit then
    v_soft_limited := true;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'plan_key', v_plan_key,
    'action', p_action,
    'reserved', p_count,
    'week_count', v_new_week_count,
    'week_limit_hard', v_limit_week_hard,
    'week_limit_soft', v_limit_week_soft,
    'remaining', case when v_limit_week_hard is null then null
                      else greatest(v_limit_week_hard - v_new_week_count, 0) end,
    'window_start', v_week_start,
    'reset_at', v_reset_at,
    'soft_limited', v_soft_limited
  );
end;
$function$;


revoke execute on function public.reserve_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, integer) to service_role;
