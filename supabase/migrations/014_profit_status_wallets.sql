-- Profit status: where the profit is kept, by wallet network or Binance account, instead of "in MetaMask".
--
-- * Lots marked IN_METAMASK by 013 become METAMASK_ETH: every one is an ETH lot and their notes
--   don't name a network. They can be changed in the Investments table.

alter table public.investments
  drop constraint if exists investments_profit_status_valid;

update public.investments
   set profit_status = 'METAMASK_ETH'
 where profit_status = 'IN_METAMASK';

alter table public.investments
  add constraint investments_profit_status_valid
    check (profit_status is null or profit_status in (
      'SPENT', 'METAMASK_ETH', 'METAMASK_BSC', 'METAMASK_MATIC', 'BINANCE_SPOT', 'BINANCE_FUNDING'
    ));
