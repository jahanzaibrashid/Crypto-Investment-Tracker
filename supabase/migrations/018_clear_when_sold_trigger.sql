-- One trigger for the "fully sold" rule: replaces the two from 016 and 017.
--
-- * exchange and target_price are cleared as soon as status is SOLD. Partly sold lots keep both.
-- * Deleting a sale doesn't bring them back.
-- * The update below permanently deletes the target price of lots sold before 017.

drop trigger if exists investments_clear_exchange_when_sold on public.investments;
drop trigger if exists investments_clear_target_when_sold on public.investments;
drop function if exists public.investments_clear_exchange_when_sold();
drop function if exists public.investments_clear_target_when_sold();

-- Named to fire after investments_before_update, which can change status.
create or replace function public.investments_clear_when_sold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.exchange := null;
  new.target_price := null;
  return new;
end;
$$;

create trigger investments_clear_when_sold
  before update on public.investments
  for each row
  when (new.status = 'SOLD')
  execute function public.investments_clear_when_sold();

-- The backfill must not touch updated_at.
alter table public.investments disable trigger user;
update public.investments
   set target_price = null
 where status = 'SOLD'
   and target_price is not null;
alter table public.investments enable trigger user;
