import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  PRICE_BATCH_SIZE,
  fetchPrices,
  normalizeCoinIds,
  parsePriceResponse,
  parseSearchResponse,
  searchCoins,
} from '@/features/prices/coingecko.service'
import { resolveQuote } from '@/features/prices/prices.hooks'
import { PRICE_MAX_AGE_MS, PROVIDER_QUOTE_MAX_AGE_MS } from '@/lib/constants'

function mockFetch(impl: (url: URL) => Response | Promise<Response>) {
  const fn = vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(new URL(String(input)))))
  vi.stubGlobal('fetch', fn)
  return fn
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeCoinIds', () => {
  it('dedupes, lowercases, sorts and drops invalid ids', () => {
    expect(normalizeCoinIds(['ethereum', 'Bitcoin', 'bitcoin', 'bad id!', ''])).toEqual(['bitcoin', 'ethereum'])
  })
})

describe('fetchPrices', () => {
  it('requests each unique id once, in USD, and parses prices as decimal strings', async () => {
    const fetchFn = mockFetch((url) => {
      expect(url.pathname).toBe('/api/v3/simple/price')
      expect(url.searchParams.get('ids')).toBe('bitcoin,ethereum')
      expect(url.searchParams.get('vs_currencies')).toBe('usd')
      return json({
        bitcoin: { usd: 65000.12, last_updated_at: 1_700_000_000 },
        ethereum: { usd: 3200.5 },
      })
    })
    const snap = await fetchPrices(['ethereum', 'bitcoin', 'bitcoin'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(snap.prices.bitcoin).toEqual({ usd: '65000.12', lastUpdatedAt: 1_700_000_000_000 })
    expect(snap.prices.ethereum).toEqual({ usd: '3200.5', lastUpdatedAt: null })
  })

  it('makes no request for an empty id list', async () => {
    const fetchFn = mockFetch(() => json({}))
    const snap = await fetchPrices([])
    expect(fetchFn).not.toHaveBeenCalled()
    expect(snap.prices).toEqual({})
  })

  it('batches large id lists', async () => {
    const ids = Array.from({ length: PRICE_BATCH_SIZE + 5 }, (_, i) => `coin-${i}`)
    const fetchFn = mockFetch(() => json({}))
    await fetchPrices(ids)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('omits coins the provider does not know (unavailable, not zero)', async () => {
    mockFetch(() => json({ bitcoin: { usd: 1 } }))
    const snap = await fetchPrices(['bitcoin', 'not-a-real-coin'])
    expect(snap.prices['not-a-real-coin']).toBeUndefined()
  })

  it('raises a rate-limit error with retry-after on HTTP 429', async () => {
    mockFetch(() => new Response('{}', { status: 429, headers: { 'retry-after': '30' } }))
    await expect(fetchPrices(['bitcoin'])).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30 })
  })

  it('raises a network error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(fetchPrices(['bitcoin'])).rejects.toMatchObject({ kind: 'network' })
  })

  it('raises an http error on 5xx', async () => {
    mockFetch(() => new Response('oops', { status: 503 }))
    await expect(fetchPrices(['bitcoin'])).rejects.toMatchObject({ kind: 'http', status: 503 })
  })

  it('raises a malformed error on invalid JSON', async () => {
    mockFetch(() => new Response('<html>', { status: 200 }))
    await expect(fetchPrices(['bitcoin'])).rejects.toMatchObject({ kind: 'malformed' })
  })
})

describe('parsePriceResponse', () => {
  it('rejects non-object payloads', () => {
    expect(() => parsePriceResponse([], ['bitcoin'])).toThrow(MarketDataError)
    expect(() => parsePriceResponse(null, ['bitcoin'])).toThrow(MarketDataError)
  })

  it('drops malformed entries instead of coercing', () => {
    const out = parsePriceResponse(
      { a: { usd: 'NaN' }, b: { usd: -1 }, c: { usd: null }, d: 'x', e: { usd: 0.00000123 } },
      ['a', 'b', 'c', 'd', 'e'],
    )
    expect(Object.keys(out)).toEqual(['e'])
    expect(out.e!.usd).toBe('0.00000123')
  })

  it('ignores ids that were not requested', () => {
    expect(parsePriceResponse({ bitcoin: { usd: 1 }, evil: { usd: 2 } }, ['bitcoin'])).toEqual({
      bitcoin: { usd: '1', lastUpdatedAt: null },
    })
  })
})

describe('coin search', () => {
  it('parses and sanitizes search results; sends only the search term', async () => {
    const fetchFn = mockFetch((url) => {
      expect(url.pathname).toBe('/api/v3/search')
      expect([...url.searchParams.keys()]).toEqual(['query'])
      return json({
        coins: [
          { id: 'pepe', name: 'Pepe', symbol: 'pepe', market_cap_rank: 30, thumb: 'https://x/pepe.png' },
          { id: 'BAD ID', name: 'x', symbol: 'x' },
          { id: 'ok', name: '', symbol: 'x' },
          { id: 'tracker', name: 'Tracker', symbol: 'trk', thumb: 'javascript:alert(1)' },
        ],
      })
    })
    const results = await searchCoins('  pepe ')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(results).toEqual([
      { id: 'pepe', name: 'Pepe', symbol: 'PEPE', marketCapRank: 30, thumb: 'https://x/pepe.png' },
      { id: 'tracker', name: 'Tracker', symbol: 'TRK', marketCapRank: null, thumb: null },
    ])
  })

  it('rejects malformed search payloads', () => {
    expect(() => parseSearchResponse({ nope: [] })).toThrow(MarketDataError)
  })
})

describe('resolveQuote (freshness)', () => {
  const now = 10_000_000_000
  const snap = (fetchedAt: number, lastUpdatedAt: number | null = null) => ({
    fetchedAt,
    prices: { bitcoin: { usd: '100', lastUpdatedAt } },
  })

  it('is live right after a successful fetch', () => {
    const q = resolveQuote('bitcoin', snap(now - 1000, now - 5000), { now, hasError: false, isFetching: false })
    expect(q.status).toBe('live')
    expect(q.price!.toString()).toBe('100')
  })

  it('keeps the last good price but marks it stale when the latest refresh failed', () => {
    const q = resolveQuote('bitcoin', snap(now - 1000), { now, hasError: true, isFetching: false })
    expect(q.status).toBe('stale')
    expect(q.price!.toString()).toBe('100')
  })

  it('is stale when our last fetch is too old', () => {
    const q = resolveQuote('bitcoin', snap(now - PRICE_MAX_AGE_MS - 1), { now, hasError: false, isFetching: false })
    expect(q.status).toBe('stale')
  })

  it("is stale when the provider's quote is too old", () => {
    const q = resolveQuote('bitcoin', snap(now, now - PROVIDER_QUOTE_MAX_AGE_MS - 1), { now, hasError: false, isFetching: false })
    expect(q.status).toBe('stale')
  })

  it('is unavailable (null price) when the coin is missing', () => {
    const q = resolveQuote('dogecoin', snap(now), { now, hasError: false, isFetching: false })
    expect(q).toMatchObject({ status: 'unavailable', price: null })
  })

  it('is loading during the first fetch', () => {
    const q = resolveQuote('bitcoin', undefined, { now, hasError: false, isFetching: true })
    expect(q).toMatchObject({ status: 'loading', price: null })
  })

  it('is unavailable when the first fetch failed', () => {
    const q = resolveQuote('bitcoin', undefined, { now, hasError: true, isFetching: false })
    expect(q).toMatchObject({ status: 'unavailable', price: null })
  })
})
