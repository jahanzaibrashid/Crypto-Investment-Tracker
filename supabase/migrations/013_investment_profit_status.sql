-- What happened to a lot's profit: spent (withdrawn and used) or kept in MetaMask.
--
-- * Optional: NULL = not selected. Changed from the dropdown in the Investments table.
-- * Lots get a first value from their note: "spent" = SPENT, "profit in mm" or "profit in metamask"
--   = IN_METAMASK. Any other note stays not selected. Notes are not changed.
-- * Clients may set it on insert and change it later (column grants, as in 002).
-- * import_investments is replaced with the same body plus the new column.

alter table public.investments
  add column if not exists profit_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'investments_profit_status_valid' and conrelid = 'public.investments'::regclass
  ) then
    alter table public.investments
      add constraint investments_profit_status_valid
        check (profit_status is null or profit_status in ('SPENT', 'IN_METAMASK'));
  end if;
end;
$$;

grant insert (profit_status) on public.investments to authenticated;
grant update (profit_status) on public.investments to authenticated;

update public.investments i
   set profit_status = case when i.note ~* 'spent' then 'SPENT' else 'IN_METAMASK' end
 where i.profit_status is null
   and i.note ~* 'spent|profit in (mm|metamask)';

-- Same as 007, plus "profit_status" in each lot of the payload (optional).
create or replace function public.import_investments(p_lots jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lot   jsonb;
  v_sale  jsonb;
  v_id    uuid;
  v_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if p_lots is null or jsonb_typeof(p_lots) <> 'array' then
    raise exception 'Import payload must be an array' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_lots) > 2000 then
    raise exception 'Too many investments in one import (maximum 2000)' using errcode = 'program_limit_exceeded';
  end if;

  for v_lot in select value from jsonb_array_elements(p_lots) loop
    insert into public.investments (coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee, long_term, note, exchange, profit_status)
    values (
      v_lot ->> 'coin_id',
      btrim(v_lot ->> 'coin_name'),
      upper(btrim(v_lot ->> 'symbol')),
      (v_lot ->> 'buy_date')::date,
      (v_lot ->> 'buy_price')::numeric,
      (v_lot ->> 'quantity')::numeric,
      coalesce((v_lot ->> 'buy_fee')::numeric, 0),
      coalesce((v_lot ->> 'long_term')::boolean, false),
      nullif(btrim(coalesce(v_lot ->> 'note', '')), ''),
      nullif(btrim(coalesce(v_lot ->> 'exchange', '')), ''),
      nullif(btrim(coalesce(v_lot ->> 'profit_status', '')), '')
    )
    returning id into v_id;

    if jsonb_typeof(v_lot -> 'sales') = 'array' then
      if jsonb_array_length(v_lot -> 'sales') > 1000 then
        raise exception 'Too many sales for one investment (maximum 1000)' using errcode = 'program_limit_exceeded';
      end if;
      for v_sale in select value from jsonb_array_elements(v_lot -> 'sales') loop
        insert into public.investment_sales (investment_id, sold_date, quantity, price, fee, note)
        values (
          v_id,
          (v_sale ->> 'sold_date')::date,
          (v_sale ->> 'quantity')::numeric,
          (v_sale ->> 'price')::numeric,
          coalesce((v_sale ->> 'fee')::numeric, 0),
          nullif(btrim(coalesce(v_sale ->> 'note', '')), '')
        );
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.import_investments(jsonb) from public, anon;
grant execute on function public.import_investments(jsonb) to authenticated;
