create table if not exists user_rate_limits (
  user_id uuid references auth.users(id) primary key,
  count int default 0,
  last_reset timestamptz default now()
);

-- Enable RLS
alter table user_rate_limits enable row level security;

-- Create policy to allow users to read their own rate limit
create policy "Users can read own rate limit"
  on user_rate_limits for select
  using (auth.uid() = user_id);

-- NO policies for INSERT/UPDATE/DELETE for authenticated users.
-- Only the Service Role (admin) can modify this table.

-- RPC to check and increment rate limit
-- We remove SECURITY DEFINER because we will call this as the Service Role (admin),
-- which already has full privileges.
create or replace function check_and_increment_rate_limit(user_id uuid, limit_count int)
returns json
language plpgsql
as $$
declare
  current_count int;
  last_reset_time timestamptz;
begin
  -- Get current state
  select count, last_reset into current_count, last_reset_time
  from user_rate_limits
  where user_rate_limits.user_id = check_and_increment_rate_limit.user_id;

  -- If no record, insert one
  if not found then
    insert into user_rate_limits (user_id, count, last_reset)
    values (user_id, 1, now());
    return json_build_object('allowed', true, 'remaining', limit_count - 1);
  end if;

  -- Check if reset is needed (24 hours)
  if now() > last_reset_time + interval '1 day' then
    update user_rate_limits
    set count = 1, last_reset = now()
    where user_rate_limits.user_id = check_and_increment_rate_limit.user_id;
    return json_build_object('allowed', true, 'remaining', limit_count - 1);
  end if;

  -- Check limit
  if current_count >= limit_count then
    return json_build_object('allowed', false, 'remaining', 0);
  else
    update user_rate_limits
    set count = count + 1
    where user_rate_limits.user_id = check_and_increment_rate_limit.user_id;
    return json_build_object('allowed', true, 'remaining', limit_count - (current_count + 1));
  end if;
end;
$$;
