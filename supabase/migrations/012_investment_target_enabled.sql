-- Whether a lot's target sell price is in use.
--
-- * On (default): the table shows the lot's value and profit at the target price instead of the live price.
-- * Off: the target is kept but ignored; the table shows the live price as usual.
-- * Only meaningful when target_price is set (011).

alter table public.investments
  add column if not exists target_enabled boolean not null default true;

grant update (target_enabled) on public.investments to authenticated;
