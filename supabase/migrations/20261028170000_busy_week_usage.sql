-- =============================================================================
-- Busy week: atomic usage reservation, refunds, and batch status.
--
-- Applies after 20261028150000_baseline. Idempotent (create ... if not exists,
-- create or replace, drop policy if exists) so it can run twice.
--
-- Security model:
--   - reserve_usage and release_usage are SECURITY DEFINER with a fixed
--     search_path. EXECUTE is revoked from public, anon and authenticated and
--     granted to service_role only. Only server code calls them, through the
--     admin client, after it has authenticated the user.
--   - generation_batches has RLS on. Authenticated users can select their own
--     rows. Nothing else is granted: all writes come from the server.
--
-- Do not run this against production without Kyle's go-ahead. It is applied to
-- the busy-week-preview branch first.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Batch status table (idempotency key + progress for resuming in the browser).
-- -----------------------------------------------------------------------------
create table if not exists public.generation_batches (
  id uuid not null,
  user_id uuid not null,
  week_start date not null,
  status text not null,
  requested integer not null,
  succeeded integer not null default 0,
  results jsonb not null default '[]'::jsonb,
  usage_window_start timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint generation_batches_pkey primary key (id),
  constraint generation_batches_status_check check (status in ('running', 'completed', 'partial', 'failed')),
  constraint generation_batches_requested_check check (requested between 1 and 7),
  constraint generation_batches_succeeded_check check (succeeded between 0 and requested),
  constraint generation_batches_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

create index if not exists generation_batches_user_created_idx
  on public.generation_batches (user_id, created_at desc);

alter table public.generation_batches enable row level security;

drop policy if exists "Users can view their own generation batches" on public.generation_batches;
create policy "Users can view their own generation batches"
  on public.generation_batches
  as permissive
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Explicit grants: Supabase's default privileges can add more to new tables.
revoke all on table public.generation_batches from public, anon, authenticated;
grant select on table public.generation_batches to authenticated;
grant all on table public.generation_batches to service_role;


-- -----------------------------------------------------------------------------
-- reserve_usage: reserve p_count generations for one busy-week batch.
--
-- Returns jsonb. Never increments partially: the weekly bucket moves by
-- p_count in one conditional upsert, and the burst buckets (minute, hour) move
-- by 1 for the whole batch. If any step blocks, the inner block is rolled back.
-- The row lock taken by the upsert makes concurrent reserves serialize, so the
-- weekly hard limit cannot be overshot.
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

  if v_plan_key = 'free' then
    return jsonb_build_object('allowed', false, 'reason', 'paid_plan_required', 'plan_key', v_plan_key);
  end if;

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


-- -----------------------------------------------------------------------------
-- release_usage: give back p_count generations to the week bucket that was
-- reserved (p_window_start), so a Monday reset between reserve and refund still
-- refunds the right week. Never goes below 0. Tokens are not touched.
-- -----------------------------------------------------------------------------
create or replace function public.release_usage(p_user_id uuid, p_action text, p_count integer, p_window_start timestamp with time zone)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_old integer;
  v_new integer;
begin
  if p_action is distinct from 'generate' or p_count is null or p_count < 1 or p_window_start is null then
    return jsonb_build_object('released', 0);
  end if;

  select c.count into v_old
  from public.user_usage_counters c
  where c.user_id = p_user_id
    and c.scope = 'week_generate'
    and c.window_start = p_window_start
  for update;

  if not found then
    return jsonb_build_object('released', 0);
  end if;

  v_new := greatest(v_old - p_count, 0);

  update public.user_usage_counters
  set count = v_new,
      updated_at = timezone('utc'::text, now())
  where user_id = p_user_id
    and scope = 'week_generate'
    and window_start = p_window_start;

  return jsonb_build_object('released', v_old - v_new);
end;
$function$;

revoke execute on function public.reserve_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, integer) to service_role;

revoke execute on function public.release_usage(uuid, text, integer, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.release_usage(uuid, text, integer, timestamp with time zone) to service_role;
