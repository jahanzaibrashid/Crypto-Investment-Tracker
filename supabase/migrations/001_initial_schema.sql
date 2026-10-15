-- =============================================================================
-- Crypto Investment Tracker — initial schema
--
-- Model
--   * public.investments       one row per purchase lot (coin, date, price, quantity, fee)
--   * public.investment_sales  one row per (partial or full) sale of a lot — full history kept
--   * public.portfolio_notes   one free-text note per user, optimistic concurrency via `version`
--   * public.profiles          one row per auth user, created by trigger
--
-- The sale summary columns on investments (status, sold_date, sold_price,
-- sold_quantity, sell_fee) are DERIVED from investment_sales by trigger and are
-- not writable by clients:
--   status        'SOLD' when the total sold quantity equals the purchased quantity, else 'HOLDING'
--   sold_quantity total quantity sold (NULL when nothing sold)
--   sold_date     date of the most recent sale
--   sold_price    quantity-weighted average sale price (rounded to 12 dp; display only)
--   sell_fee      total sale fees
-- Financial calculations in the app use investment_sales rows, not these summaries.
--
-- Authorization: RLS on every table (owner = auth.uid()), plus column-level
-- privileges so clients can never write user_id, derived columns or timestamps.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text null check (display_name is null or char_length(display_name) <= 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- investments (purchase lots)
-- -----------------------------------------------------------------------------
create table public.investments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coin_id       text not null check (coin_id ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  coin_name     text not null check (char_length(btrim(coin_name)) between 1 and 200),
  symbol        text not null check (char_length(btrim(symbol)) between 1 and 50),
  buy_date      date not null check (buy_date >= date '2009-01-03'),
  buy_price     numeric(30, 12) not null check (buy_price > 0),
  quantity      numeric(36, 18) not null check (quantity > 0),
  buy_fee       numeric(30, 12) not null default 0 check (buy_fee >= 0),
  status        text not null default 'HOLDING' check (status in ('HOLDING', 'SOLD')),
  sold_date     date null,
  sold_price    numeric(30, 12) null check (sold_price is null or sold_price >= 0),
  sold_quantity numeric(36, 18) null,
  sell_fee      numeric(30, 12) not null default 0 check (sell_fee >= 0),
  note          text null check (note is null or char_length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- needed for the composite FK from investment_sales (guarantees same owner)
  constraint investments_id_user_unique unique (id, user_id),

  constraint investments_sold_quantity_valid
    check (sold_quantity is null or (sold_quantity > 0 and sold_quantity <= quantity)),

  constraint investments_sold_fields_consistent
    check (
      (sold_quantity is null and sold_date is null and sold_price is null and sell_fee = 0)
      or (sold_quantity is not null and sold_date is not null and sold_price is not null)
    ),

  constraint investments_sold_after_buy
    check (sold_date is null or sold_date >= buy_date),

  -- SOLD means no remaining quantity; HOLDING means some quantity remains.
  constraint investments_status_matches_quantity
    check (
      (status = 'SOLD' and sold_quantity is not null and sold_quantity = quantity)
      or (status = 'HOLDING' and (sold_quantity is null or sold_quantity < quantity))
    )
);

create index investments_user_buy_date_idx on public.investments (user_id, buy_date desc);
create index investments_user_status_idx   on public.investments (user_id, status);
create index investments_user_coin_idx     on public.investments (user_id, coin_id);

create trigger investments_set_updated_at
  before update on public.investments
  for each row execute function public.set_updated_at();

-- Keep the derived status consistent when the purchased quantity is edited, and
-- refuse edits that would contradict recorded sales.
create or replace function public.investments_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Changing the owner of an investment is not allowed'
      using errcode = 'insufficient_privilege';
  end if;

  if new.buy_date is distinct from old.buy_date and exists (
    select 1 from public.investment_sales s
    where s.investment_id = new.id and s.sold_date < new.buy_date
  ) then
    raise exception 'Buy date cannot be after an existing sale date'
      using errcode = 'check_violation';
  end if;

  if new.quantity is distinct from old.quantity then
    new.status := case
      when new.sold_quantity is not null and new.sold_quantity = new.quantity then 'SOLD'
      else 'HOLDING'
    end;
  end if;

  return new;
end;
$$;

create trigger investments_before_update
  before update on public.investments
  for each row execute function public.investments_before_update();

-- -----------------------------------------------------------------------------
-- investment_sales (partial / full sales of a lot)
-- -----------------------------------------------------------------------------
create table public.investment_sales (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sold_date     date not null,
  quantity      numeric(36, 18) not null check (quantity > 0),
  price         numeric(30, 12) not null check (price >= 0),
  fee           numeric(30, 12) not null default 0 check (fee >= 0),
  note          text null check (note is null or char_length(note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The sale must belong to an investment owned by the same user.
  constraint investment_sales_investment_owner_fk
    foreign key (investment_id, user_id)
    references public.investments (id, user_id)
    on delete cascade
);

create index investment_sales_investment_idx on public.investment_sales (investment_id, sold_date);
create index investment_sales_user_date_idx  on public.investment_sales (user_id, sold_date desc);

create trigger investment_sales_set_updated_at
  before update on public.investment_sales
  for each row execute function public.set_updated_at();

-- Validate a sale against its lot. Locks the parent lot row so concurrent sales
-- of the same lot are serialized and cannot oversell.
create or replace function public.investment_sales_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_quantity   numeric;
  v_buy_date   date;
  v_sold_other numeric;
begin
  if tg_op = 'UPDATE' and new.investment_id is distinct from old.investment_id then
    raise exception 'A sale cannot be moved to a different investment'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Changing the owner of a sale is not allowed'
      using errcode = 'insufficient_privilege';
  end if;

  -- Runs as the calling user, so RLS hides other users' investments.
  select i.quantity, i.buy_date
    into v_quantity, v_buy_date
    from public.investments i
   where i.id = new.investment_id
     for update;

  if not found then
    raise exception 'Investment not found' using errcode = 'foreign_key_violation';
  end if;

  if new.sold_date < v_buy_date then
    raise exception 'Sale date cannot be before the buy date' using errcode = 'check_violation';
  end if;

  select coalesce(sum(s.quantity), 0)
    into v_sold_other
    from public.investment_sales s
   where s.investment_id = new.investment_id
     and s.id <> new.id;

  if v_sold_other + new.quantity > v_quantity then
    raise exception 'Sale quantity exceeds the remaining quantity of this investment'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger investment_sales_validate
  before insert or update on public.investment_sales
  for each row execute function public.investment_sales_validate();

-- Recompute the derived sale summary on the parent lot.
-- SECURITY DEFINER because clients have no UPDATE privilege on the derived
-- columns. It only touches the lot referenced by the sale row that fired it,
-- and that row already passed RLS and the owner-matching foreign key.
create or replace function public.investment_sales_refresh_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_investment_id uuid;
begin
  v_investment_id := case when tg_op = 'DELETE' then old.investment_id else new.investment_id end;

  update public.investments i
     set sold_quantity = s.total_qty,
         sold_date     = s.last_date,
         sold_price    = case when s.total_qty > 0 then round(s.gross / s.total_qty, 12) end,
         sell_fee      = coalesce(s.total_fee, 0),
         status        = case when s.total_qty = i.quantity then 'SOLD' else 'HOLDING' end
    from (
      select sum(x.quantity)           as total_qty,
             max(x.sold_date)          as last_date,
             sum(x.quantity * x.price) as gross,
             sum(x.fee)                as total_fee
        from public.investment_sales x
       where x.investment_id = v_investment_id
    ) s
   where i.id = v_investment_id;

  return null;
end;
$$;

revoke all on function public.investment_sales_refresh_summary() from public, anon, authenticated;

create trigger investment_sales_refresh_summary
  after insert or update or delete on public.investment_sales
  for each row execute function public.investment_sales_refresh_summary();

-- -----------------------------------------------------------------------------
-- portfolio_notes (one per user)
-- -----------------------------------------------------------------------------
create table public.portfolio_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note       text not null default '' check (char_length(note) <= 20000),
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint portfolio_notes_user_unique unique (user_id)
);

create or replace function public.portfolio_notes_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Changing the owner of a note is not allowed'
      using errcode = 'insufficient_privilege';
  end if;
  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger portfolio_notes_before_update
  before update on public.portfolio_notes
  for each row execute function public.portfolio_notes_before_update();

-- -----------------------------------------------------------------------------
-- New-user bootstrap: profile + empty portfolio note.
-- Identity comes only from the auth.users row (new.id); the optional display
-- name from user metadata is treated as untrusted display text and truncated.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''), 100)
  )
  on conflict (id) do nothing;

  insert into public.portfolio_notes (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Privileges: least privilege, column-level where clients write.
-- user_id is never client-writable; it defaults to auth.uid().
-- -----------------------------------------------------------------------------
revoke all on public.profiles, public.investments, public.investment_sales, public.portfolio_notes
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.investments to authenticated;
grant insert (coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee, note)
  on public.investments to authenticated;
grant update (coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee, note)
  on public.investments to authenticated;

grant select, delete on public.investment_sales to authenticated;
grant insert (investment_id, sold_date, quantity, price, fee, note)
  on public.investment_sales to authenticated;
grant update (sold_date, quantity, price, fee, note)
  on public.investment_sales to authenticated;

grant select on public.portfolio_notes to authenticated;
grant insert (note) on public.portfolio_notes to authenticated;
grant update (note) on public.portfolio_notes to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.investments      enable row level security;
alter table public.investment_sales enable row level security;
alter table public.portfolio_notes  enable row level security;

-- profiles
create policy "profiles: owner can read"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- investments
create policy "investments: owner can read"
  on public.investments for select to authenticated
  using (user_id = (select auth.uid()));
create policy "investments: owner can insert"
  on public.investments for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "investments: owner can update"
  on public.investments for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "investments: owner can delete"
  on public.investments for delete to authenticated
  using (user_id = (select auth.uid()));

-- investment_sales
create policy "sales: owner can read"
  on public.investment_sales for select to authenticated
  using (user_id = (select auth.uid()));
create policy "sales: owner can insert"
  on public.investment_sales for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "sales: owner can update"
  on public.investment_sales for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "sales: owner can delete"
  on public.investment_sales for delete to authenticated
  using (user_id = (select auth.uid()));

-- portfolio_notes
create policy "notes: owner can read"
  on public.portfolio_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notes: owner can insert"
  on public.portfolio_notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "notes: owner can update"
  on public.portfolio_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Realtime: portfolio note changes are pushed to the owner's other devices.
-- Realtime respects the RLS policies above.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.portfolio_notes;
  end if;
end;
$$;
