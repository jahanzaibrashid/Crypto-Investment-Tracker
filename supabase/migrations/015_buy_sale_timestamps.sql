-- Exact moment for each buy and sale, so lots sold on the same day can be ordered.
--
-- * buy_date and sold_date stay plain dates, as picked in the forms.
-- * bought_at and sold_at hold that date plus the Pakistan clock time when it was saved.
--   Triggers set them, so forms, sales and imports are all covered and clients can't write them.
-- * Changing the date sets the time again; editing anything else keeps it.
-- * Existing rows take the clock time of their created_at.

alter table public.investments add column if not exists bought_at timestamptz;
alter table public.investment_sales add column if not exists sold_at timestamptz;

-- The backfill must not touch updated_at or re-run the sale checks.
alter table public.investments disable trigger user;
update public.investments
   set bought_at = (buy_date + (created_at at time zone 'Asia/Karachi')::time) at time zone 'Asia/Karachi'
 where bought_at is null;
alter table public.investments enable trigger user;

alter table public.investment_sales disable trigger user;
update public.investment_sales
   set sold_at = (sold_date + (created_at at time zone 'Asia/Karachi')::time) at time zone 'Asia/Karachi'
 where sold_at is null;
alter table public.investment_sales enable trigger user;

alter table public.investments alter column bought_at set not null;
alter table public.investment_sales alter column sold_at set not null;

create or replace function public.investments_set_bought_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.buy_date is distinct from old.buy_date then
    new.bought_at := (new.buy_date + (clock_timestamp() at time zone 'Asia/Karachi')::time) at time zone 'Asia/Karachi';
  end if;
  return new;
end;
$$;

drop trigger if exists investments_set_bought_at on public.investments;
create trigger investments_set_bought_at
  before insert or update on public.investments
  for each row execute function public.investments_set_bought_at();

create or replace function public.investment_sales_set_sold_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.sold_date is distinct from old.sold_date then
    new.sold_at := (new.sold_date + (clock_timestamp() at time zone 'Asia/Karachi')::time) at time zone 'Asia/Karachi';
  end if;
  return new;
end;
$$;

drop trigger if exists investment_sales_set_sold_at on public.investment_sales;
create trigger investment_sales_set_sold_at
  before insert or update on public.investment_sales
  for each row execute function public.investment_sales_set_sold_at();
