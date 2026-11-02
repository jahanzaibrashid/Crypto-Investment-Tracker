-- Target sell price: the price the user plans to sell an open lot at.
--
-- * Optional: NULL = no target. Only used to show the lot's value and profit at that price;
--   it never changes status, cost basis or realized P/L.
-- * Same precision and sign rule as buy_price.
-- * Clients may change it on an existing lot (column-level grant, as for the other editable columns).

alter table public.investments
  add column if not exists target_price numeric(30, 12) null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'investments_target_price_positive' and conrelid = 'public.investments'::regclass
  ) then
    alter table public.investments
      add constraint investments_target_price_positive
        check (target_price is null or target_price > 0);
  end if;
end;
$$;

grant update (target_price) on public.investments to authenticated;
