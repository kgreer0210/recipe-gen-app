-- Kitchen OS: dated weekly calendar slots, kitchen profile, pantry, plan-sourced grocery.

-- ---------------------------------------------------------------------------
-- weekly_plan: day/slot scheduling
-- ---------------------------------------------------------------------------
alter table weekly_plan
  add column if not exists week_start date,
  add column if not exists day_of_week smallint,
  add column if not exists meal_slot text,
  add column if not exists servings_override integer,
  add column if not exists cooked_at timestamp with time zone;

update weekly_plan
set week_start = (date_trunc('week', timezone('utc', now())))::date
where week_start is null;

alter table weekly_plan
  alter column week_start set default (date_trunc('week', timezone('utc', now())))::date,
  alter column week_start set not null;

alter table weekly_plan drop constraint if exists weekly_plan_day_of_week_check;
alter table weekly_plan
  add constraint weekly_plan_day_of_week_check
  check (day_of_week is null or (day_of_week >= 0 and day_of_week <= 6));

alter table weekly_plan drop constraint if exists weekly_plan_meal_slot_check;
alter table weekly_plan
  add constraint weekly_plan_meal_slot_check
  check (
    meal_slot is null
    or meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')
  );

alter table weekly_plan drop constraint if exists weekly_plan_servings_override_check;
alter table weekly_plan
  add constraint weekly_plan_servings_override_check
  check (
    servings_override is null
    or (servings_override >= 1 and servings_override <= 12)
  );

alter table weekly_plan drop constraint if exists weekly_plan_user_id_recipe_id_key;

create unique index if not exists weekly_plan_user_week_slot_uidx
  on weekly_plan (user_id, week_start, day_of_week, meal_slot)
  where day_of_week is not null and meal_slot is not null;

create index if not exists weekly_plan_user_week_idx
  on weekly_plan (user_id, week_start);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_plan'
      and policyname = 'Users can update their own weekly plan'
  ) then
    create policy "Users can update their own weekly plan"
      on weekly_plan for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- user_settings: kitchen profile
-- ---------------------------------------------------------------------------
alter table user_settings
  add column if not exists default_servings integer not null default 4,
  add column if not exists dietary_preferences text[] not null default '{}',
  add column if not exists disliked_ingredients text[] not null default '{}';

alter table user_settings drop constraint if exists user_settings_default_servings_check;
alter table user_settings
  add constraint user_settings_default_servings_check
  check (default_servings >= 1 and default_servings <= 12);

-- ---------------------------------------------------------------------------
-- pantry_items
-- ---------------------------------------------------------------------------
create table if not exists pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  amount numeric not null default 0,
  unit text not null,
  category text,
  source text not null default 'manual',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (user_id, name_normalized, unit),
  constraint pantry_items_source_check check (source in ('manual', 'leftover')),
  constraint pantry_items_amount_check check (amount >= 0)
);

create index if not exists pantry_items_user_id_idx on pantry_items (user_id);

alter table pantry_items enable row level security;

drop policy if exists "Users can view their own pantry" on pantry_items;
create policy "Users can view their own pantry"
  on pantry_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own pantry" on pantry_items;
create policy "Users can insert their own pantry"
  on pantry_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own pantry" on pantry_items;
create policy "Users can update their own pantry"
  on pantry_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own pantry" on pantry_items;
create policy "Users can delete their own pantry"
  on pantry_items for delete
  using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table pantry_items;
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- grocery_list: plan rebuild without wiping manual items
-- ---------------------------------------------------------------------------
alter table grocery_list
  add column if not exists source text not null default 'manual',
  add column if not exists plan_week_start date;

alter table grocery_list drop constraint if exists grocery_list_source_check;
alter table grocery_list
  add constraint grocery_list_source_check
  check (source in ('manual', 'plan'));

create index if not exists grocery_list_plan_week_idx
  on grocery_list (user_id, plan_week_start)
  where source = 'plan';
