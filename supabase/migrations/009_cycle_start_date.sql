-- Trading cycles: change the start date (e.g. move it back so earlier sales are counted) and delete a cycle.
--
-- * Done through change_trading_cycle_start so the cycles stay in order and never overlap:
--     - the new start must be after the previous cycle's start and before the next cycle's start;
--     - a cycle that was closed early must still start on or before its closing date;
--     - if the previous cycle would now overlap, it is closed the day before the new start
--       (its history is kept; nothing is deleted).
-- * SECURITY INVOKER: RLS limits every read and write to the caller's own cycles.
-- * Results are derived from sales, so moving the start date only changes which sales count.

grant update (start_date) on public.trading_cycles to authenticated;

create or replace function public.change_trading_cycle_start(p_id uuid, p_start_date date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cycle public.trading_cycles%rowtype;
  v_prev  public.trading_cycles%rowtype;
  v_next  public.trading_cycles%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_start_date is null then
    raise exception 'Start date is required' using errcode = 'check_violation';
  end if;

  -- Serialize with other cycle changes from other tabs or devices.
  perform 1 from public.trading_cycles for update;

  select * into v_cycle from public.trading_cycles where id = p_id;
  if v_cycle.id is null then
    raise exception 'Trading cycle not found' using errcode = 'foreign_key_violation';
  end if;
  if p_start_date = v_cycle.start_date then
    return;
  end if;

  select * into v_prev from public.trading_cycles
   where start_date < v_cycle.start_date order by start_date desc limit 1;
  select * into v_next from public.trading_cycles
   where start_date > v_cycle.start_date order by start_date asc limit 1;

  if v_prev.id is not null and p_start_date <= v_prev.start_date then
    raise exception 'The start date must be after the previous cycle''s start date'
      using errcode = 'check_violation';
  end if;
  if v_next.id is not null and p_start_date >= v_next.start_date then
    raise exception 'The start date must be before the next cycle''s start date'
      using errcode = 'check_violation';
  end if;
  if v_cycle.closed_on is not null and p_start_date > v_cycle.closed_on then
    raise exception 'The start date cannot be after the day this cycle was closed'
      using errcode = 'check_violation';
  end if;

  -- Keep cycles from overlapping: the previous one ends the day before the new start.
  if v_prev.id is not null
     and least(v_prev.start_date + v_prev.length_days - 1, coalesce(v_prev.closed_on, 'infinity'::date)) >= p_start_date then
    update public.trading_cycles set closed_on = p_start_date - 1 where id = v_prev.id;
  end if;

  update public.trading_cycles set start_date = p_start_date where id = p_id;
end;
$$;

revoke all on function public.change_trading_cycle_start(uuid, date) from public, anon;
grant execute on function public.change_trading_cycle_start(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Delete a trading cycle.
-- * Only the cycle's settings are deleted; results come from investment sales, which are untouched.
-- * If the deleted cycle had closed the previous cycle early (closed_on = its start − 1), the
--   previous cycle is reopened so it runs its full length again.
-- -----------------------------------------------------------------------------
grant delete on public.trading_cycles to authenticated;

drop policy if exists "cycles: owner can delete" on public.trading_cycles;
create policy "cycles: owner can delete"
  on public.trading_cycles for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.delete_trading_cycle(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cycle      public.trading_cycles%rowtype;
  v_next_start date;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.trading_cycles for update;

  select * into v_cycle from public.trading_cycles where id = p_id;
  if v_cycle.id is null then
    raise exception 'Trading cycle not found' using errcode = 'foreign_key_violation';
  end if;

  -- Reopen the previous cycle, but never past the start of a later cycle.
  select min(start_date) into v_next_start from public.trading_cycles where start_date > v_cycle.start_date;
  update public.trading_cycles p
     set closed_on = case
           when v_next_start is not null and v_next_start - 1 < p.start_date + p.length_days - 1 then v_next_start - 1
           else null
         end
   where p.closed_on = v_cycle.start_date - 1
     and p.start_date < v_cycle.start_date;

  delete from public.trading_cycles where id = p_id;
end;
$$;

revoke all on function public.delete_trading_cycle(uuid) from public, anon;
grant execute on function public.delete_trading_cycle(uuid) to authenticated;
