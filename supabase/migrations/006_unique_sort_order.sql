-- Fix: drag-and-drop had no effect when lots shared a sort_order.
--
-- 004 backfilled sort_order from created_at, and lots created in one transaction (for
-- example an import) share created_at, so they got the same sort_order. 005 only
-- reshuffled the existing values among the lots, which changes nothing when they're equal.
--
-- 1. Give every lot a unique sort_order, keeping today's order (same tie-breakers as the app:
--    sort_order desc, then newest created, then id). Values stay below the current time,
--    so lots created later still appear on top.
-- 2. reorder_open_investments now assigns fresh, distinct values (top = highest), so ties
--    can never stall a reorder again.

update public.investments i
   set sort_order = r.new_order
  from (
    select id,
           (extract(epoch from now()) * 1000000)::bigint
             - row_number() over (partition by user_id order by sort_order desc, created_at desc, id) as new_order
      from public.investments
  ) r
 where i.id = r.id;

create or replace function public.reorder_open_investments(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
  v_top     bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  -- Lock the caller's open lots so two reorders can't interleave.
  perform 1 from public.investments where status = 'HOLDING' for update;

  select coalesce(array_agg(id order by id), '{}'), max(sort_order)
    into v_current, v_top
    from public.investments
   where status = 'HOLDING';

  if coalesce(cardinality(p_ids), 0) <> cardinality(v_current)
     or (select coalesce(array_agg(x order by x), '{}') from unnest(p_ids) as x) <> v_current then
    raise exception 'The list changed in the meantime. Refresh and try again'
      using errcode = 'check_violation';
  end if;

  -- Top of the list keeps the current highest value; each next lot is one lower.
  -- Never above the current time, so newly created lots still land on top.
  update public.investments i
     set sort_order = v.new_order
    from (
      select u.id, v_top - (u.pos - 1) as new_order
        from unnest(p_ids) with ordinality as u(id, pos)
    ) v
   where i.id = v.id
     and i.sort_order is distinct from v.new_order;
end;
$$;
