import { useQuery } from '@tanstack/react-query'
import { MarketDataError } from '@/features/prices/coingecko.service'
import { fetchKlines, fetchTickerPrice, INTERVAL_MS, type Interval } from './binance.service'

/** Candles loaded for live analysis: enough for EMA200 plus swing history. */
export const LIVE_CANDLES = 500

export const marketKeys = {
  candles: (symbol: string, interval: Interval, limit: number) => ['binance-klines', symbol, interval, limit] as const,
  ticker: (symbol: string) => ['binance-ticker', symbol] as const,
}

const noRetryOnRateLimit = (count: number, error: unknown) => !(error instanceof MarketDataError && error.kind === 'rate_limited') && count < 2

/** Recent candles (closed + the one forming). Refreshed every minute, or every 15 s on 15m charts. */
export function useCandles(symbol: string, interval: Interval, limit = LIVE_CANDLES) {
  const refresh = INTERVAL_MS[interval] <= 15 * 60_000 ? 15_000 : 60_000
  return useQuery({
    queryKey: marketKeys.candles(symbol, interval, limit),
    queryFn: ({ signal }) => fetchKlines({ symbol, interval, limit }, signal),
    staleTime: refresh,
    refetchInterval: refresh,
    retry: noRetryOnRateLimit,
  })
}

/** Latest trade price, every 10 s. */
export function useTickerPrice(symbol: string) {
  return useQuery({
    queryKey: marketKeys.ticker(symbol),
    queryFn: ({ signal }) => fetchTickerPrice(symbol, signal),
    staleTime: 10_000,
    refetchInterval: 10_000,
    retry: noRetryOnRateLimit,
  })
}
