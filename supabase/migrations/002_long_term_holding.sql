-- Long-term holding flag.
-- A purchase lot the user intends to hold long-term. It only affects how an
-- OPEN position is categorised (Holding vs Long-term); once fully sold, a lot
-- is shown as "Sold in profit" or "Sold in loss" based on its realized P/L.

alter table public.investments
  add column if not exists long_term boolean not null default false;

-- Clients may set it on insert and change it later (column-level grants, as for the other editable columns).
grant insert (long_term) on public.investments to authenticated;
grant update (long_term) on public.investments to authenticated;

create index if not exists investments_user_long_term_idx
  on public.investments (user_id)
  where long_term;
