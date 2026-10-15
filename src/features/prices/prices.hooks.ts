import { useCallback, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { D } from '@/lib/decimal'
import {
  COIN_SEARCH_DEBOUNCE_MS,
  COIN_SEARCH_MIN_CHARS,
  PRICE_MAX_AGE_MS,
  PRICE_REFETCH_INTERVAL_MS,
  PRICE_STALE_TIME_MS,
  PROVIDER_QUOTE_MAX_AGE_MS,
} from '@/lib/constants'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useNow } from '@/hooks/useNow'
import { MarketDataError, fetchPrices, normalizeCoinIds, searchCoins } from './coingecko.service'
import type { PriceLookup, PriceQuote, PriceSnapshot } from './prices.types'

export const priceKeys = {
  all: ['prices'] as const,
  forIds: (ids: string[]) => ['prices', ids.join(',')] as const,
  search: (q: string) => ['coin-search', q] as const,
}

export interface QuoteContext {
  now: number
  /** The most recent fetch attempt failed. */
  hasError: boolean
  /** A fetch is in flight. */
  isFetching: boolean
}

/** Pure: decide what price (if any) to show for a coin and how fresh it is. */
export function resolveQuote(coinId: string, snapshot: PriceSnapshot | undefined, ctx: QuoteContext): PriceQuote {
  const entry = snapshot?.prices[coinId]
  if (!snapshot || !entry) {
    return {
      status: ctx.isFetching && !ctx.hasError ? 'loading' : 'unavailable',
      price: null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      providerUpdatedAt: null,
    }
  }
  const tooOld = ctx.now - snapshot.fetchedAt > PRICE_MAX_AGE_MS
  const providerOld = entry.lastUpdatedAt !== null && ctx.now - entry.lastUpdatedAt > PROVIDER_QUOTE_MAX_AGE_MS
  return {
    status: ctx.hasError || tooOld || providerOld ? 'stale' : 'live',
    price: new D(entry.usd),
    fetchedAt: snapshot.fetchedAt,
    providerUpdatedAt: entry.lastUpdatedAt,
  }
}

export interface PriceBook {
  getQuote: PriceLookup
  /** Time of the last successful price fetch (ms), if any. */
  lastSuccessAt: number | null
  isFetching: boolean
  isLoading: boolean
  error: unknown
  /** True when shown prices are not current (refresh failed or too old). */
  isStale: boolean
  refresh: () => Promise<void>
}

export function usePrices(coinIds: Iterable<string>): PriceBook {
  const ids = useMemo(() => normalizeCoinIds(coinIds), [coinIds])
  const now = useNow(15_000)

  const query = useQuery({
    queryKey: priceKeys.forIds(ids),
    queryFn: ({ signal }) => fetchPrices(ids, signal),
    enabled: ids.length > 0,
    staleTime: PRICE_STALE_TIME_MS,
    refetchInterval: PRICE_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: (count, error) => !(error instanceof MarketDataError && error.kind === 'rate_limited') && count < 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
  })

  const snapshot = query.data
  const hasError = query.isError
  const isFetching = query.isFetching
  const getQuote = useCallback<PriceLookup>(
    (coinId) => resolveQuote(coinId, snapshot, { now, hasError, isFetching }),
    [snapshot, now, hasError, isFetching],
  )

  const { refetch } = query
  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const lastSuccessAt = snapshot?.fetchedAt ?? null

  return {
    getQuote,
    lastSuccessAt,
    isFetching,
    isLoading: query.isLoading,
    error: query.error,
    isStale: Boolean(snapshot) && (hasError || (lastSuccessAt !== null && now - lastSuccessAt > PRICE_MAX_AGE_MS)),
    refresh,
  }
}

export function useCoinSearch(rawQuery: string) {
  const q = useDebouncedValue(rawQuery.trim().toLowerCase(), COIN_SEARCH_DEBOUNCE_MS)
  return useQuery({
    queryKey: priceKeys.search(q),
    queryFn: ({ signal }) => searchCoins(q, signal),
    enabled: q.length >= COIN_SEARCH_MIN_CHARS,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: (count, error) => !(error instanceof MarketDataError && error.kind === 'rate_limited') && count < 1,
  })
}
