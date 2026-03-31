-- keepalive table: prevents Supabase free-tier pause by giving the cron a
-- real write target. One row only; UPSERT updates pinged_at each run.
create table if not exists keepalive (
  id int primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint keepalive_single_row check (id = 1)
);

insert into keepalive (id, pinged_at) values (1, now())
on conflict (id) do nothing;
