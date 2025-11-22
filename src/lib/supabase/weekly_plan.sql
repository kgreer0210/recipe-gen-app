-- Create a table for weekly meal plans
create table if not exists weekly_plan (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, recipe_id)
);

-- Set up RLS (Row Level Security)
alter table weekly_plan enable row level security;

create policy "Users can view their own weekly plan"
  on weekly_plan for select
  using (auth.uid() = user_id);

create policy "Users can insert into their own weekly plan"
  on weekly_plan for insert
  with check (auth.uid() = user_id);

create policy "Users can delete from their own weekly plan"
  on weekly_plan for delete
  using (auth.uid() = user_id);

