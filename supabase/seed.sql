-- Local development seed (applied by `supabase db reset` on a LOCAL stack only).
--
-- This seed contains no market prices — current prices always come from
-- CoinGecko at runtime. It adds example purchase lots for a local user with
-- the email demo@example.com, if that user exists. Create the user first via
-- the app's Register page (or Supabase Studio → Authentication), then run
-- `supabase db reset` again, or paste this file into the SQL editor.

do $$
declare
  v_user uuid;
  v_lot  uuid;
begin
  select id into v_user from auth.users where email = 'demo@example.com' limit 1;
  if v_user is null then
    raise notice 'seed.sql: demo@example.com not found; skipping example data';
    return;
  end if;

  insert into public.investments (user_id, coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee, note)
  values
    (v_user, 'bitcoin',  'Bitcoin',  'BTC', date '2024-01-15', 42000,  0.05, 5,   'Example lot — first BTC buy'),
    (v_user, 'bitcoin',  'Bitcoin',  'BTC', date '2024-08-05', 54000,  0.02, 2,   'Example lot — dip buy'),
    (v_user, 'ethereum', 'Ethereum', 'ETH', date '2024-03-01', 3400,   1.5,  4.5, null),
    (v_user, 'solana',   'Solana',   'SOL', date '2024-02-10', 105,    20,   1,   null);

  insert into public.investments (user_id, coin_id, coin_name, symbol, buy_date, buy_price, quantity, buy_fee)
  values (v_user, 'cardano', 'Cardano', 'ADA', date '2024-01-05', 0.55, 1000, 1)
  returning id into v_lot;

  insert into public.investment_sales (investment_id, user_id, sold_date, quantity, price, fee, note)
  values (v_lot, v_user, date '2024-03-12', 1000, 0.78, 1, 'Example full sale');
end;
$$;
