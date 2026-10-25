import type { Dec } from '@/lib/decimal'

/** One provider quote as returned by the market-data service. */
export interface ProviderPrice {
  /** USD price as a decimal string. */
  usd: string
  /** Provider-side timestamp of the quote (ms), when supplied. */
  lastUpdatedAt: number | null
}

export interface PriceSnapshot {
  prices: Record<string, ProviderPrice>
  /** Client time (ms) when this snapshot was fetched successfully. */
  fetchedAt: number
}

/**
 * Price as seen by the UI and calculations.
 *  - live:        recent successful fetch, recent provider quote
 *  - stale:       last known good price, but the latest refresh failed or it is old
 *  - unavailable: no price known for this coin (never treated as zero)
 *  - loading:     first fetch still in flight
 */
export type PriceStatus = 'live' | 'stale' | 'unavailable' | 'loading'

export interface PriceQuote {
  status: PriceStatus
  price: Dec | null
  /** When our app last fetched this price successfully (ms). */
  fetchedAt: number | null
  providerUpdatedAt: number | null
}

export interface CoinSearchResult {
  id: string
  name: string
  symbol: string
  marketCapRank: number | null
  thumb: string | null
}

export type PriceLookup = (coinId: string) => PriceQuote

/** One daily USD close (YYYY-MM-DD, UTC). The latest day holds the current price. */
export interface DailyClose {
  date: string
  close: string
}
