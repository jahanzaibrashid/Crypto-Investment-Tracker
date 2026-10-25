import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchKlines, fetchKlinesRange, fetchTickerPrice, KLINES_LIMIT, parseKlines, splitClosed } from '@/features/analyzer/binance.service'
import { MarketDataError } from '@/features/prices/coingecko.service'

const H4 = 4 * 3_600_000

/** A raw Binance kline row. */
function row(openTime: number, o = 100, h = 110, l = 90, c = 105, v = 10): unknown[] {
  return [openTime, String(o), String(h), String(l), String(c), String(v), openTime + H4 - 1, String(v * c), 42, String(v / 2), String((v / 2) * c), '0']
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

afterEach(() => vi.unstubAllGlobals())

describe('parseKlines', () => {
  it('parses rows into numeric candles, oldest first', () => {
    const [a, b] = parseKlines([row(H4), row(0)])
    expect(a!.openTime).toBe(0)
    expect(b).toMatchObject({ openTime: H4, open: 100, high: 110, low: 90, close: 105, volume: 10, closeTime: 2 * H4 - 1, trades: 42, takerBuyVolume: 5 })
  })

  it('drops malformed or impossible candles instead of coercing them', () => {
    const candles = parseKlines([
      row(0),
      row(H4, 100, 95, 90, 105), // high below close
      row(2 * H4, 100, 110, 0, 105), // zero low
      ['x'],
      [3 * H4, 'abc', '1', '1', '1', '1', 0, '1', 1, '1', '1'],
    ])
    expect(candles).toHaveLength(1)
  })

  it('rejects a non-array payload', () => {
    expect(() => parseKlines({ code: -1121 })).toThrow(MarketDataError)
  })
})

describe('splitClosed', () => {
  it('separates the candle that is still forming', () => {
    const candles = parseKlines([row(0), row(H4)])
    const { closed, forming } = splitClosed(candles, H4 + 1000)
    expect(closed.map((c) => c.openTime)).toEqual([0])
    expect(forming?.openTime).toBe(H4)
  })

  it('keeps every candle when the last one has closed', () => {
    const candles = parseKlines([row(0), row(H4)])
    expect(splitClosed(candles, 2 * H4).forming).toBeNull()
  })
})

describe('fetching', () => {
  it('requests klines from the market-data host with the pair, interval and limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json([row(0)]))
    vi.stubGlobal('fetch', fetchMock)
    await fetchKlines({ symbol: 'ETHUSDT', interval: '4h', limit: 5000 })
    const url = new URL(fetchMock.mock.calls[0]![0] as URL)
    expect(url.origin).toBe('https://data-api.binance.vision')
    expect(url.pathname).toBe('/api/v3/klines')
    expect(url.searchParams.get('symbol')).toBe('ETHUSDT')
    expect(url.searchParams.get('interval')).toBe('4h')
    expect(url.searchParams.get('limit')).toBe(String(KLINES_LIMIT)) // capped
  })

  it('falls back to api.binance.com on a network error or a region block', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json([row(0)]))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchKlines({ symbol: 'ETHUSDT', interval: '4h' })).toHaveLength(1)
    expect(new URL(fetchMock.mock.calls[1]![0] as URL).origin).toBe('https://api.binance.com')

    const blocked = vi.fn().mockResolvedValueOnce(json({}, 451)).mockResolvedValueOnce(json([row(0)]))
    vi.stubGlobal('fetch', blocked)
    expect(await fetchKlines({ symbol: 'ETHUSDT', interval: '4h' })).toHaveLength(1)
  })

  it('reports rate limiting without trying another host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 429, { 'retry-after': '30' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchKlines({ symbol: 'ETHUSDT', interval: '4h' })).rejects.toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 30 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid pair before any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchKlines({ symbol: 'eth/usdt', interval: '4h' })).rejects.toMatchObject({ kind: 'config' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pages through a long range and removes duplicates', async () => {
    const page1 = Array.from({ length: KLINES_LIMIT }, (_, i) => row(i * H4))
    const page2 = [row((KLINES_LIMIT - 1) * H4), row(KLINES_LIMIT * H4), row((KLINES_LIMIT + 1) * H4)] // first one repeats
    const fetchMock = vi.fn().mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2))
    vi.stubGlobal('fetch', fetchMock)
    const candles = await fetchKlinesRange({ symbol: 'ETHUSDT', interval: '4h', startTime: 0, endTime: (KLINES_LIMIT + 1) * H4 })
    expect(candles).toHaveLength(KLINES_LIMIT + 2)
    expect(new URL(fetchMock.mock.calls[1]![0] as URL).searchParams.get('startTime')).toBe(String(KLINES_LIMIT * H4))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reads the ticker price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ symbol: 'ETHUSDT', price: '2512.40000000' })))
    expect(await fetchTickerPrice('ETHUSDT')).toBe(2512.4)
  })
})
