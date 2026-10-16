-- Drag-and-drop ordering: save the whole order of the caller's open lots at once.
--
-- p_ids is every open (HOLDING, including partially sold) lot of the caller, top to bottom.
-- The lots keep the same set of sort_order values; they are only reassigned in the new
-- order, so new lots (which get the current time) still land on top.
-- The list must match the caller's open lots exactly; otherwise another tab or device
-- changed them in the meantime and nothing is saved.
-- SECURITY INVOKER: RLS limits every read and write to the caller's own rows.

create or replace function public.reorder_open_investments(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
  v_values  bigint[];
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Lock the caller's open lots so two reorders can't interleave.
  perform 1 from public.investments where status = 'HOLDING' for update;

  select coalesce(array_agg(id order by id), '{}'), coalesce(array_agg(sort_order order by sort_order desc), '{}')
    into v_current, v_values
    from public.investments
   where status = 'HOLDING';

  if coalesce(cardinality(p_ids), 0) <> cardinality(v_current)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) <> v_current then
    raise exception 'The list changed in the meantime. Refresh and try again'
      using errcode = 'check_violation';
  end if;

  update public.investments i
     set sort_order = v.new_order
    from (
      select u.id, v_values[u.pos] as new_order
        from unnest(p_ids) with ordinality as u(id, pos)
    ) v
   where i.id = v.id
     and i.sort_order is distinct from v.new_order;
end;
$$;

revoke all on function public.reorder_open_investments(uuid[]) from public, anon;
grant execute on function public.reorder_open_investments(uuid[]) to authenticated;

-- Replaced by reorder_open_investments (the up/down buttons are gone).
drop function if exists public.swap_investment_order(uuid, uuid);
