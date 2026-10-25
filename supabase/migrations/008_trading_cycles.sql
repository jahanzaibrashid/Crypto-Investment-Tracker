-- Trading cycles: a profit-target period (default 30 days) on the Strategy page.
--
-- * Settings only. Actual results are never stored here: the app derives them from
--   investment_sales (realized P/L on each sale date), so no trade is recorded twice.
-- * History is kept: starting a new cycle closes the running one (closed_on) instead of
--   deleting it. Clients have no DELETE privilege on this table.
-- * A cycle covers start_date .. least(start_date + length_days - 1, closed_on).
--   Cycles never overlap: a new one must start after the latest cycle's start date.
-- * capital, daily_target, length_days and fee_rate can be edited later; the start date can't.
-- * fee_rate is a percent per trade side (0.1 = 0.1%), used only for projections.

create table if not exists public.trading_cycles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  start_date   date not null check (start_date >= date '2009-01-03'),
  length_days  integer not null default 30 check (length_days between 1 and 366),
  capital      numeric(30, 12) not null check (capital > 0),
  daily_target numeric(30, 12) not null check (daily_target > 0),
  fee_rate     numeric(8, 4) not null default 0.1 check (fee_rate >= 0 and fee_rate <= 10),
  closed_on    date null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint trading_cycles_user_start_unique unique (user_id, start_date),
  constraint trading_cycles_closed_after_start check (closed_on is null or closed_on >= start_date)
);

create index if not exists trading_cycles_user_start_idx on public.trading_cycles (user_id, start_date desc);

drop trigger if exists trading_cycles_set_updated_at on public.trading_cycles;
create trigger trading_cycles_set_updated_at
  before update on public.trading_cycles
  for each row execute function public.set_updated_at();

create or replace function public.trading_cycles_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Changing the owner of a trading cycle is not allowed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trading_cycles_before_update on public.trading_cycles;
create trigger trading_cycles_before_update
  before update on public.trading_cycles
  for each row execute function public.trading_cycles_before_update();

-- Privileges: cycles are created only through start_trading_cycle; settings are editable.
revoke all on public.trading_cycles from anon, authenticated;
grant select on public.trading_cycles to authenticated;
grant insert (start_date, length_days, capital, daily_target, fee_rate) on public.trading_cycles to authenticated;
grant update (length_days, capital, daily_target, fee_rate, closed_on) on public.trading_cycles to authenticated;

alter table public.trading_cycles enable row level security;

drop policy if exists "cycles: owner can read" on public.trading_cycles;
create policy "cycles: owner can read"
  on public.trading_cycles for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "cycles: owner can insert" on public.trading_cycles;
create policy "cycles: owner can insert"
  on public.trading_cycles for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "cycles: owner can update" on public.trading_cycles;
create policy "cycles: owner can update"
  on public.trading_cycles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Start a new cycle and, in the same transaction, close the caller's cycle that is still
-- running on the new start date (it ends the day before). Returns the new cycle's id.
-- SECURITY INVOKER: RLS limits every read and write to the caller's own cycles.
create or replace function public.start_trading_cycle(
  p_start_date   date,
  p_length_days  integer,
  p_capital      numeric,
  p_daily_target numeric,
  p_fee_rate     numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Serialize concurrent starts from two tabs or devices.
  perform 1 from public.trading_cycles for update;

  if exists (select 1 from public.trading_cycles where start_date >= p_start_date) then
    raise exception 'A new cycle must start after the start date of your latest cycle'
      using errcode = 'check_violation';
  end if;

  update public.trading_cycles
     set closed_on = p_start_date - 1
   where closed_on is null
     and start_date + length_days - 1 >= p_start_date;

  insert into public.trading_cycles (start_date, length_days, capital, daily_target, fee_rate)
  values (p_start_date, p_length_days, p_capital, p_daily_target, coalesce(p_fee_rate, 0.1))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_trading_cycle(date, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.start_trading_cycle(date, integer, numeric, numeric, numeric) to authenticated;
