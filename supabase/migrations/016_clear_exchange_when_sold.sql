-- "Bought on" only says where coins are held, so a fully sold lot doesn't keep one.
--
-- * A trigger clears exchange as soon as status is SOLD, so sales, quantity edits, imports and
--   forms are all covered. Partly sold lots keep it: some of their coins are still there.
-- * Deleting a sale doesn't bring it back: the lot returns to holding with no exchange.
-- * The update below permanently deletes the exchange of lots already sold.

-- Named to fire after investments_before_update, which can change status.
create or replace function public.investments_clear_exchange_when_sold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'SOLD' then
    new.exchange := null;
  end if;
  return new;
end;
$$;

drop trigger if exists investments_clear_exchange_when_sold on public.investments;
create trigger investments_clear_exchange_when_sold
  before update on public.investments
  for each row execute function public.investments_clear_exchange_when_sold();

-- The backfill must not touch updated_at.
alter table public.investments disable trigger user;
update public.investments
   set exchange = null
 where status = 'SOLD'
   and exchange is not null;
alter table public.investments enable trigger user;
