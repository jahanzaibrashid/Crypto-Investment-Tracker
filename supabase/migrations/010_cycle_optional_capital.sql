-- Trading cycles: capital becomes optional and fees default to 0.
--
-- * A cycle is now created from its start date, end date and daily profit target only.
--   Existing cycles keep their capital; new ones may leave it empty (NULL).
-- * The fee rate defaults to 0 (fees are not used in the app's calculations).

alter table public.trading_cycles alter column capital drop not null;
alter table public.trading_cycles drop constraint if exists trading_cycles_capital_check;
alter table public.trading_cycles add constraint trading_cycles_capital_check check (capital is null or capital > 0);

alter table public.trading_cycles alter column fee_rate set default 0;

-- Same as in 008, but capital may be NULL and a missing fee means 0.
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
  values (p_start_date, p_length_days, p_capital, p_daily_target, coalesce(p_fee_rate, 0))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_trading_cycle(date, integer, numeric, numeric, numeric) from public, anon;
grant execute on function public.start_trading_cycle(date, integer, numeric, numeric, numeric) to authenticated;
