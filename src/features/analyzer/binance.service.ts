/**
 * Binance public spot market data (no API key, no secrets). Only the trading pair, interval
 * and time range are ever sent.
 *
 * Base URL: data-api.binance.vision, Binance's market-data-only host. It sends
 * `access-control-allow-origin: *`, so the browser calls it directly; api.binance.com is the
 * fallback when that host can't be reached.
 *
 * Candle prices and volumes are parsed to numbers: analysis and backtests work on thousands of
 * candles and only need float precision. Money shown to the user is rounded for display.
 */
import { MarketDataError } from '@/features/prices/coingecko.service'

export const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'] as const

export const INTERVALS = ['15m', '1h', '4h', '12h', '1d', '3d', '1w', '1M'] as const
export type Interval = (typeof INTERVALS)[number]

export const INTERVAL_MS: Record<Interval, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  /** Weekly candles open on Monday 00:00 UTC. */
  '1w': 7 * 24 * 60 * 60_000,
  /** Calendar months vary (28–31 days); this is an approximation for refresh timing only. */
  '1M': 30 * 24 * 60 * 60_000,
}

/** Binance's maximum candles per request. */
export const KLINES_LIMIT = 1000

export interface Candle {
  /** Open time, ms since epoch (UTC). */
  openTime: number
  /** Last ms of the candle (openTime + interval − 1). */
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  /** Base-asset volume (ETH). */
  volume: number
  /** Quote-asset volume (USDT). */
  quoteVolume: number
  trades: number
  /** Base volume bought by takers (aggressive buyers). */
  takerBuyVolume: number
}

const SYMBOL_RE = /^[A-Z0-9]{2,20}$/

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : NaN
}

/** Validate a /api/v3/klines payload. Malformed rows are dropped, never coerced to zero. */
export function parseKlines(payload: unknown): Candle[] {
  if (!Array.isArray(payload)) throw new MarketDataError('malformed', 'Klines response is not an array')
  const out: Candle[] = []
  for (const row of payload) {
    if (!Array.isArray(row) || row.length < 11) continue
    const c: Candle = {
      openTime: num(row[0]),
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
      closeTime: num(row[6]),
      quoteVolume: num(row[7]),
      trades: num(row[8]),
      takerBuyVolume: num(row[9]),
    }
    const valid =
      Object.values(c).every(Number.isFinite) &&
      c.open > 0 &&
      c.low > 0 &&
      c.high >= Math.max(c.open, c.close, c.low) &&
      c.low <= Math.min(c.open, c.close) &&
      c.volume >= 0
    if (valid) out.push(c)
  }
  return out.sort((a, b) => a.openTime - b.openTime)
}

/** Split into closed candles and the one still forming (if any). Analysis uses closed candles only. */
export function splitClosed(candles: Candle[], now: number): { closed: Candle[]; forming: Candle | null } {
  const last = candles[candles.length - 1]
  if (last && last.closeTime >= now) return { closed: candles.slice(0, -1), forming: last }
  return { closed: candles, forming: null }
}

async function getJson(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  let lastError: unknown = null
  for (const host of BINANCE_HOSTS) {
    const url = new URL(path, host)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await fetch(url, { headers: { accept: 'application/json' }, signal })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      lastError = new MarketDataError('network', 'Network error contacting Binance')
      continue // try the next host
    }
    if (res.status === 429 || res.status === 418) {
      const retry = Number(res.headers.get('retry-after'))
      throw new MarketDataError('rate_limited', 'Rate limited', {
        status: res.status,
        retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined,
      })
    }
    if (res.status === 451 || res.status === 403) {
      lastError = new MarketDataError('http', `Binance HTTP ${res.status}`, { status: res.status })
      continue // region/WAF block on this host: try the next one
    }
    if (!res.ok) throw new MarketDataError('http', `Binance HTTP ${res.status}`, { status: res.status })
    try {
      return await res.json()
    } catch {
      throw new MarketDataError('malformed', 'Invalid JSON from Binance')
    }
  }
  throw lastError ?? new MarketDataError('network', 'Binance is unreachable')
}

export interface KlinesQuery {
  symbol: string
  interval: Interval
  limit?: number
  startTime?: number
  endTime?: number
}

/** One request: up to 1,000 candles, oldest first. */
export async function fetchKlines(q: KlinesQuery, signal?: AbortSignal): Promise<Candle[]> {
  if (!SYMBOL_RE.test(q.symbol)) throw new MarketDataError('config', 'Invalid trading pair')
  const params: Record<string, string> = {
    symbol: q.symbol,
    interval: q.interval,
    limit: String(Math.max(1, Math.min(KLINES_LIMIT, Math.round(q.limit ?? 500)))),
  }
  if (q.startTime !== undefined) params.startTime = String(q.startTime)
  if (q.endTime !== undefined) params.endTime = String(q.endTime)
  return parseKlines(await getJson('/api/v3/klines', params, signal))
}

/**
 * All candles from `startTime` to `endTime` (paged, 1,000 per request). Used for backtests;
 * duplicates across page boundaries are removed by open time.
 */
export async function fetchKlinesRange(
  q: { symbol: string; interval: Interval; startTime: number; endTime: number },
  signal?: AbortSignal,
): Promise<Candle[]> {
  const byTime = new Map<number, Candle>()
  let from = q.startTime
  for (let page = 0; page < 100 && from <= q.endTime; page++) {
    const batch = await fetchKlines({ symbol: q.symbol, interval: q.interval, startTime: from, endTime: q.endTime, limit: KLINES_LIMIT }, signal)
    for (const c of batch) byTime.set(c.openTime, c)
    if (batch.length < KLINES_LIMIT) break
    // Continue right after the last candle returned (exact for every interval, including months).
    from = batch[batch.length - 1]!.closeTime + 1
  }
  return [...byTime.values()].sort((a, b) => a.openTime - b.openTime)
}

/** Latest trade price. */
export async function fetchTickerPrice(symbol: string, signal?: AbortSignal): Promise<number> {
  if (!SYMBOL_RE.test(symbol)) throw new MarketDataError('config', 'Invalid trading pair')
  const payload = await getJson('/api/v3/ticker/price', { symbol }, signal)
  const price = num((payload as { price?: unknown } | null)?.price)
  if (!(price > 0)) throw new MarketDataError('malformed', 'Ticker response has no price')
  return price
}
