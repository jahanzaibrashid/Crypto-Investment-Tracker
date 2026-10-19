export const APP_NAME = 'Crypto Investment Tracker'

/** Bitcoin genesis block date — no crypto purchase can predate it. */
export const EARLIEST_BUY_DATE = '2009-01-03'

/** Market price polling. CoinGecko's Demo plan allows ~30 calls/min; we stay far below. */
export const PRICE_STALE_TIME_MS = 60_000
export const PRICE_REFETCH_INTERVAL_MS = 120_000
/** A price older than this (since our last successful fetch) is labelled stale. */
export const PRICE_MAX_AGE_MS = 10 * 60_000
/** A provider-side quote older than this is labelled stale even if our fetch succeeded. */
export const PROVIDER_QUOTE_MAX_AGE_MS = 60 * 60_000

export const COIN_SEARCH_MIN_CHARS = 2
export const COIN_SEARCH_DEBOUNCE_MS = 350

export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const

/** Database column limits (mirror supabase/migrations/001_initial_schema.sql). */
export const LIMITS = {
  priceIntegerDigits: 18,
  priceDecimals: 12,
  quantityIntegerDigits: 18,
  quantityDecimals: 18,
  noteMax: 2000,
  /** investments.exchange (007_investment_exchange.sql) */
  exchangeMax: 40,
  saleNoteMax: 1000,
  portfolioNoteMax: 20000,
} as const

/**
 * Frequently used coins for quick selection. These are identifiers only —
 * no prices are hardcoded anywhere in the app.
 */
export const COMMON_COINS = [
  { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
  { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
  { id: 'solana', name: 'Solana', symbol: 'SOL' },
  { id: 'binancecoin', name: 'BNB', symbol: 'BNB' },
  { id: 'ripple', name: 'XRP', symbol: 'XRP' },
  { id: 'cardano', name: 'Cardano', symbol: 'ADA' },
  { id: 'dogecoin', name: 'Dogecoin', symbol: 'DOGE' },
  { id: 'polkadot', name: 'Polkadot', symbol: 'DOT' },
] as const

/**
 * Exchanges and wallets suggested in the "Bought on" picker. Users can add any other name;
 * names they have used are suggested too (see features/investments/exchanges.ts).
 */
export const EXCHANGE_PRESETS = [
  'Binance',
  'MetaMask',
  'MEXC',
  'OKX',
  'Coinbase',
  'KuCoin',
  'Trust Wallet',
  'Phantom',
  'Uniswap',
  'PancakeSwap',
] as const
