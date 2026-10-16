-- Permanent, user-defined order of open (unsold) purchase lots.
--
-- * Higher sort_order = higher in the table. New lots default to the current time in
--   microseconds, so a new investment always appears at the top.
-- * Existing lots are backfilled from created_at, which keeps today's "newest first" order.
-- * Values are unique in practice (microsecond timestamps), and reordering only swaps two
--   values, so the set stays unique.
-- * Fully sold lots are ordered by sale date in the app; their sort_order is ignored and
--   swap_investment_order refuses to move them.

-- Add and backfill only once, so running this file again never resets a saved order.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'investments' and column_name = 'sort_order'
  ) then
    alter table public.investments
      add column sort_order bigint not null
        default (extract(epoch from clock_timestamp()) * 1000000)::bigint;

    update public.investments
       set sort_order = (extract(epoch from created_at) * 1000000)::bigint;
  end if;
end;
$$;

create index if not exists investments_user_sort_order_idx
  on public.investments (user_id, sort_order desc);

-- Clients can change the order of their own rows (RLS still limits them to their rows).
grant update (sort_order) on public.investments to authenticated;

-- Swap the positions of two of the caller's open lots in one statement (atomic).
-- SECURITY INVOKER: RLS hides other users' rows, so a foreign id simply isn't found.
create or replace function public.swap_investment_order(p_id uuid, p_other_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_a public.investments%rowtype;
  v_b public.investments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_id = p_other_id then
    return;
  end if;

  select * into v_a from public.investments where id = p_id for update;
  select * into v_b from public.investments where id = p_other_id for update;
  if v_a.id is null or v_b.id is null then
    raise exception 'Investment not found' using errcode = 'foreign_key_violation';
  end if;
  if v_a.status = 'SOLD' or v_b.status = 'SOLD' then
    raise exception 'Sold investments are ordered by sale date and cannot be moved'
      using errcode = 'check_violation';
  end if;

  update public.investments i
     set sort_order = case
           when i.id = v_a.id then case when v_a.sort_order = v_b.sort_order then v_b.sort_order + 1 else v_b.sort_order end
           else v_a.sort_order
         end
   where i.id in (v_a.id, v_b.id);
end;
$$;

revoke all on function public.swap_investment_order(uuid, uuid) from public, anon;
grant execute on function public.swap_investment_order(uuid, uuid) to authenticated;
