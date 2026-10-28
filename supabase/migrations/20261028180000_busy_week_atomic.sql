-- =============================================================================
-- Busy week: exactly-once refunds, atomic batch start, atomic dinner placement.
--
-- Applies after 20261028170000_busy_week_usage. Idempotent (add column if not
-- exists, drop constraint if exists, create or replace, drop policy if exists)
-- so it can run twice.
--
-- Security model (CLAUDE.md: the service role is used only for the usage RPCs):
--   - begin_busy_week_batch and settle_busy_week_batch are SECURITY DEFINER with a
--     fixed search_path. They write generation_batches and move usage counters, and
--     the batch tables have no client write grants. EXECUTE is granted to
--     service_role only, like reserve_usage and release_usage. The server calls
--     them after it has authenticated the user.
--   - place_busy_week_dinner is SECURITY INVOKER. It runs as the signed-in user, so
--     auth.uid() is the owner and the weekly_plan and recipes RLS policies apply.
--     EXECUTE is granted to authenticated only, so no service role is needed.
--
-- Do not run this against production without Kyle's go-ahead. It is applied to
-- the busy-week-preview branch first.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Per-batch refund counter. A batch's failed picks are refunded exactly once:
-- settle_busy_week_batch refunds (refundable picks - refunded) and stores the new
-- total in the same transaction.
-- -----------------------------------------------------------------------------
alter table public.generation_batches
  add column if not exists refunded integer not null default 0;

alter table public.generation_batches
  drop constraint if exists generation_batches_refunded_check;

alter table public.generation_batches
  add constraint generation_batches_refunded_check check (refunded between 0 and requested);


-- -----------------------------------------------------------------------------
-- begin_busy_week_batch: record a new batch and reserve its generations, in one
-- transaction. The batch row's primary key is the idempotency check. A duplicate
-- id returns 'duplicate' and reserves nothing. A blocked reservation keeps the
-- row as failed, with no picks. A started batch stores the week bucket it charged
-- (usage_window_start), so a later refund goes to that week even across a Monday
-- reset. p_charge = false is the admin bypass: the row is recorded, nothing is
-- counted.
-- -----------------------------------------------------------------------------
create or replace function public.begin_busy_week_batch(
  p_batch_id uuid,
  p_user_id uuid,
  p_week_start date,
  p_count integer,
  p_results jsonb,
  p_charge boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_reservation jsonb;
begin
  if p_count is null or p_count < 1 or p_count > 7 then
    return jsonb_build_object('outcome', 'invalid_count');
  end if;

  begin
    insert into public.generation_batches (id, user_id, week_start, status, requested, succeeded, results)
    values (p_batch_id, p_user_id, p_week_start, 'running', p_count, 0, coalesce(p_results, '[]'::jsonb));
  exception
    when unique_violation then
      return jsonb_build_object('outcome', 'duplicate');
  end;

  if not coalesce(p_charge, false) then
    return jsonb_build_object('outcome', 'started', 'plan_key', 'admin', 'window_start', null, 'remaining', null);
  end if;

  v_reservation := public.reserve_usage(p_user_id, 'generate', p_count);

  if (v_reservation ->> 'allowed')::boolean is not true then
    update public.generation_batches
    set status = 'failed',
        succeeded = 0,
        results = '[]'::jsonb,
        updated_at = timezone('utc'::text, now())
    where id = p_batch_id;

    return jsonb_build_object(
      'outcome', 'blocked',
      'reason', v_reservation ->> 'reason',
      'plan_key', v_reservation ->> 'plan_key',
      'remaining', v_reservation -> 'remaining'
    );
  end if;

  update public.generation_batches
  set usage_window_start = (v_reservation ->> 'window_start')::timestamp with time zone,
      updated_at = timezone('utc'::text, now())
  where id = p_batch_id;

  return jsonb_build_object(
    'outcome', 'started',
    'plan_key', v_reservation ->> 'plan_key',
    'window_start', v_reservation -> 'window_start',
    'remaining', v_reservation -> 'remaining'
  );
end;
$function$;


-- -----------------------------------------------------------------------------
-- settle_busy_week_batch: finish one running batch, in one transaction.
--
--   1. Lock the batch row. A batch that is no longer 'running' is already settled,
--      so the call changes nothing.
--   2. If p_interrupt_pending, a pick still 'pending' is interrupted: a pick that
--      saved a recipe becomes unscheduled (kept, not refunded), and any other pick
--      becomes failed with 'interrupted'. Without it, pending picks mean the batch
--      is still live, and the call does nothing.
--   3. Refund = failed picks with a refundable error - refunded so far. The
--      release_usage call and the batch update are in this transaction, so a
--      failed release rolls back the status change too, and a retry refunds once.
--   4. Store the status, succeeded count and refunded total.
-- -----------------------------------------------------------------------------
create or replace function public.settle_busy_week_batch(p_batch_id uuid, p_interrupt_pending boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_batch public.generation_batches%rowtype;
  v_pending integer;
  v_results jsonb;
  v_refundable integer;
  v_succeeded integer;
  v_status text;
  v_refund_now integer;
begin
  select * into v_batch
  from public.generation_batches b
  where b.id = p_batch_id
  for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'not_found');
  end if;

  if v_batch.status <> 'running' then
    return jsonb_build_object('settled', false, 'reason', 'already_settled', 'status', v_batch.status, 'refunded', v_batch.refunded);
  end if;

  select count(*) into v_pending
  from jsonb_array_elements(v_batch.results) as pick
  where pick ->> 'status' = 'pending';

  if v_pending > 0 and not coalesce(p_interrupt_pending, false) then
    return jsonb_build_object('settled', false, 'reason', 'pending_picks');
  end if;

  select coalesce(jsonb_agg(
           case
             when pick ->> 'status' <> 'pending' then pick
             when pick ->> 'recipeId' is not null then pick || '{"status":"unscheduled","error":"plan_insert_failed"}'::jsonb
             else pick || '{"status":"failed","error":"interrupted"}'::jsonb
           end
           order by pos
         ), '[]'::jsonb)
  into v_results
  from jsonb_array_elements(v_batch.results) with ordinality as t(pick, pos);

  select count(*) into v_refundable
  from jsonb_array_elements(v_results) as pick
  where pick ->> 'status' = 'failed'
    and pick ->> 'error' in ('generation_failed', 'save_failed', 'interrupted');

  select count(*) into v_succeeded
  from jsonb_array_elements(v_results) as pick
  where pick ->> 'status' in ('placed', 'replaced', 'unscheduled');

  v_status := case
    when v_succeeded = v_batch.requested then 'completed'
    when v_succeeded = 0 then 'failed'
    else 'partial'
  end;

  v_refund_now := greatest(v_refundable - v_batch.refunded, 0);

  -- The admin bypass has no week bucket, so there is nothing to give back.
  if v_refund_now > 0 and v_batch.usage_window_start is not null then
    perform public.release_usage(v_batch.user_id, 'generate', v_refund_now, v_batch.usage_window_start);
  end if;

  update public.generation_batches
  set status = v_status,
      succeeded = v_succeeded,
      results = v_results,
      refunded = greatest(v_batch.refunded, v_refundable),
      updated_at = timezone('utc'::text, now())
  where id = p_batch_id;

  return jsonb_build_object(
    'settled', true,
    'status', v_status,
    'succeeded', v_succeeded,
    'refunded', greatest(v_batch.refunded, v_refundable),
    'refunded_now', v_refund_now
  );
end;
$function$;


-- -----------------------------------------------------------------------------
-- place_busy_week_dinner: put a saved recipe on one day's dinner, as the signed-in
-- user, in one transaction.
--
--   - Day empty: insert the dinner. Status 'placed'.
--   - Day holds exactly p_replace_slot_id: delete it and insert the new dinner.
--     Status 'replaced'.
--   - Day holds anything else, or a concurrent insert takes the day: insert the
--     recipe unscheduled (no day, no meal slot). Status 'slot_taken'. The original
--     dinner is left alone.
--
-- A replacement runs in a sub-block, so if the new dinner cannot be inserted the
-- delete is rolled back too and the original stays on the day.
-- Returns { status, slot } where slot is the weekly_plan row.
-- -----------------------------------------------------------------------------
create or replace function public.place_busy_week_dinner(
  p_week_start date,
  p_day_of_week integer,
  p_recipe_id uuid,
  p_replace_slot_id uuid,
  p_servings integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_occupant public.weekly_plan%rowtype;
  v_status text;
  v_slot public.weekly_plan%rowtype;
begin
  if v_user_id is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  if p_day_of_week is null or p_day_of_week < 0 or p_day_of_week > 6 then
    raise exception 'day_of_week must be 0 to 6' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = p_recipe_id and r.user_id = v_user_id
  ) then
    raise exception 'recipe not found' using errcode = 'P0002';
  end if;

  select wp.* into v_occupant
  from public.weekly_plan wp
  where wp.user_id = v_user_id
    and wp.week_start = p_week_start
    and wp.day_of_week = p_day_of_week
    and wp.meal_slot = 'dinner'
  for update;

  if not found then
    v_status := 'placed';
  elsif p_replace_slot_id is not null and v_occupant.id = p_replace_slot_id then
    v_status := 'replaced';
  else
    v_status := 'slot_taken';
  end if;

  if v_status <> 'slot_taken' then
    begin
      if v_status = 'replaced' then
        delete from public.weekly_plan wp
        where wp.id = v_occupant.id and wp.user_id = v_user_id;
      end if;

      insert into public.weekly_plan (user_id, recipe_id, week_start, day_of_week, meal_slot, servings_override)
      values (v_user_id, p_recipe_id, p_week_start, p_day_of_week, 'dinner', p_servings)
      returning * into v_slot;
    exception
      when unique_violation then
        v_status := 'slot_taken';
    end;
  end if;

  if v_status = 'slot_taken' then
    insert into public.weekly_plan (user_id, recipe_id, week_start, day_of_week, meal_slot, servings_override)
    values (v_user_id, p_recipe_id, p_week_start, null, null, p_servings)
    returning * into v_slot;
  end if;

  return jsonb_build_object('status', v_status, 'slot', to_jsonb(v_slot));
end;
$function$;


-- -----------------------------------------------------------------------------
-- Grants.
-- -----------------------------------------------------------------------------
revoke execute on function public.begin_busy_week_batch(uuid, uuid, date, integer, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.begin_busy_week_batch(uuid, uuid, date, integer, jsonb, boolean)
  to service_role;

revoke execute on function public.settle_busy_week_batch(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.settle_busy_week_batch(uuid, boolean)
  to service_role;

revoke execute on function public.place_busy_week_dinner(date, integer, uuid, uuid, integer)
  from public, anon;
grant execute on function public.place_busy_week_dinner(date, integer, uuid, uuid, integer)
  to authenticated;
