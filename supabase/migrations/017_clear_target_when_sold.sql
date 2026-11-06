-- A target price is a plan for coins still held, so a fully sold lot doesn't keep one.
--
-- * A trigger clears target_price as soon as status is SOLD, so sales, quantity edits and imports
--   are all covered. Partly sold lots keep it: it still applies to the coins left.
-- * Deleting a sale doesn't bring it back: the lot returns to holding with no target.
-- * Lots sold before this migration aren't changed here; the table never shows their target.

-- Named to fire after investments_before_update, which can change status.
create or replace function public.investments_clear_target_when_sold()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'SOLD' then
    new.target_price := null;
  end if;
  return new;
end;
$$;

drop trigger if exists investments_clear_target_when_sold on public.investments;
create trigger investments_clear_target_when_sold
  before update on public.investments
  for each row execute function public.investments_clear_target_when_sold();
