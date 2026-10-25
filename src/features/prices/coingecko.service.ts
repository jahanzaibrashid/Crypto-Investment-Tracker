/**
 * CoinGecko market data.
 *
 * Only coin IDs and search terms are ever sent to CoinGecko — never notes,
 * quantities or any other investment data.
 *
 * Transports
 *   direct: browser → https://api.coingecko.com/api/v3 (optional Demo key in
 *           `x-cg-demo-api-key`; a VITE_ key is PUBLIC in the bundle)
 *   proxy:  browser → Supabase Edge Function `coingecko-proxy` (key stays server-side)
 */
import { env } from '@/lib/env'
import { getSupabase } from '@/lib/supabase'
import { D } from '@/lib/decimal'
import type { CoinSearchResult, DailyClose, PriceSnapshot, ProviderPrice } from './prices.types'

export const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3'
export const PROXY_FUNCTION_NAME = 'coingecko-proxy'
/** Maximum ids per /simple/price request (keeps URLs well under limits). */
export const PRICE_BATCH_SIZE = 100

export type MarketDataErrorKind = 'rate_limited' | 'network' | 'http' | 'malformed' | 'config'

export class MarketDataError extends Error {
  readonly kind: MarketDataErrorKind
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(kind: MarketDataErrorKind, message: string, opts: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message)
    this.name = 'MarketDataError'
    this.kind = kind
    this.status = opts.status
    this.retryAfterSeconds = opts.retryAfterSeconds
  }
}

export function describeMarketDataError(error: unknown): string {
  if (error instanceof MarketDataError) {
    switch (error.kind) {
      case 'rate_limited':
        return `CoinGecko rate limit reached${error.retryAfterSeconds ? ` — retry in ~${error.retryAfterSeconds}s` : ''}. Showing last known prices.`
      case 'network':
        return 'Could not reach the price service. Check your connection.'
      case 'malformed':
        return 'The price service returned an unexpected response.'
      case 'config':
        return error.message
      default:
        return `The price service returned an error${error.status ? ` (HTTP ${error.status})` : ''}.`
    }
  }
  return 'Prices could not be loaded.'
}

type Endpoint = { kind: 'price'; ids: string[] } | { kind: 'search'; query: string } | { kind: 'history'; id: string; days: number }

/** Longest daily history requested (CoinGecko's free plan serves up to 365 days). */
export const MAX_HISTORY_DAYS = 365

const COIN_ID_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.ceil(n) : undefined
}

async function directRequest(endpoint: Endpoint, signal?: AbortSignal): Promise<unknown> {
  const path = endpoint.kind === 'price' ? 'simple/price' : endpoint.kind === 'search' ? 'search' : `coins/${endpoint.id}/market_chart`
  const url = new URL(`${COINGECKO_BASE_URL}/${path}`)
  if (endpoint.kind === 'history') {
    url.searchParams.set('vs_currency', 'usd')
    url.searchParams.set('days', String(endpoint.days))
    url.searchParams.set('interval', 'daily')
  } else if (endpoint.kind === 'price') {
    url.searchParams.set('ids', endpoint.ids.join(','))
    url.searchParams.set('vs_currencies', 'usd')
    url.searchParams.set('include_last_updated_at', 'true')
    url.searchParams.set('precision', 'full')
  } else {
    url.searchParams.set('query', endpoint.query)
  }
  const headers: Record<string, string> = { accept: 'application/json' }
  if (env.coingeckoApiKey) headers['x-cg-demo-api-key'] = env.coingeckoApiKey

  let res: Response
  try {
    res = await fetch(url, { headers, signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new MarketDataError('network', 'Network error contacting CoinGecko')
  }
  if (res.status === 429) {
    throw new MarketDataError('rate_limited', 'Rate limited', {
      status: 429,
      retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
    })
  }
  if (!res.ok) throw new MarketDataError('http', `CoinGecko HTTP ${res.status}`, { status: res.status })
  try {
    return await res.json()
  } catch {
    throw new MarketDataError('malformed', 'Invalid JSON from CoinGecko')
  }
}

async function proxyRequest(endpoint: Endpoint): Promise<unknown> {
  const body =
    endpoint.kind === 'price'
      ? { endpoint: 'price', ids: endpoint.ids }
      : endpoint.kind === 'search'
        ? { endpoint: 'search', query: endpoint.query }
        : { endpoint: 'history', id: endpoint.id, days: endpoint.days }
  const { data, error } = await getSupabase().functions.invoke(PROXY_FUNCTION_NAME, { body })
  if (error) {
    const ctx = (error as { context?: unknown }).context
    const status = ctx instanceof Response ? ctx.status : undefined
    if (status === 429) {
      throw new MarketDataError('rate_limited', 'Rate limited', {
        status,
        retryAfterSeconds: ctx instanceof Response ? parseRetryAfter(ctx.headers.get('retry-after')) : undefined,
      })
    }
    if (status === undefined && error.name === 'FunctionsFetchError') {
      throw new MarketDataError('network', 'Could not reach the price proxy')
    }
    if (status === 404) {
      throw new MarketDataError('config', 'Price proxy is not deployed. Deploy the coingecko-proxy Edge Function or set VITE_MARKET_DATA_MODE=direct.')
    }
    throw new MarketDataError('http', 'Price proxy error', { status })
  }
  return data
}

function request(endpoint: Endpoint, signal?: AbortSignal) {
  return env.marketDataMode === 'proxy' ? proxyRequest(endpoint) : directRequest(endpoint, signal)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Validate a /simple/price payload. Unknown or malformed coin entries are
 * dropped (→ "unavailable"), never coerced to zero.
 */
export function parsePriceResponse(payload: unknown, requestedIds: string[]): Record<string, ProviderPrice> {
  if (!isRecord(payload)) throw new MarketDataError('malformed', 'Price response is not an object')
  const out: Record<string, ProviderPrice> = {}
  for (const id of requestedIds) {
    const entry = payload[id]
    if (!isRecord(entry)) continue
    const usd = entry.usd
    if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) continue
    const updated = entry.last_updated_at
    out[id] = {
      usd: new D(usd).toString(),
      lastUpdatedAt: typeof updated === 'number' && Number.isFinite(updated) ? updated * 1000 : null,
    }
  }
  return out
}

export function normalizeCoinIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map((s) => s.trim().toLowerCase()))].filter((id) => COIN_ID_RE.test(id)).sort()
}

/** Fetch USD prices for unique coin IDs, batching to respect URL limits. */
export async function fetchPrices(coinIds: Iterable<string>, signal?: AbortSignal): Promise<PriceSnapshot> {
  const ids = normalizeCoinIds(coinIds)
  if (ids.length === 0) return { prices: {}, fetchedAt: Date.now() }
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += PRICE_BATCH_SIZE) batches.push(ids.slice(i, i + PRICE_BATCH_SIZE))
  const results = await Promise.all(
    batches.map(async (batch) => parsePriceResponse(await request({ kind: 'price', ids: batch }, signal), batch)),
  )
  return { prices: Object.assign({}, ...results), fetchedAt: Date.now() }
}

export function parseSearchResponse(payload: unknown): CoinSearchResult[] {
  if (!isRecord(payload) || !Array.isArray(payload.coins)) {
    throw new MarketDataError('malformed', 'Search response has no coins array')
  }
  const out: CoinSearchResult[] = []
  for (const c of payload.coins) {
    if (!isRecord(c)) continue
    const { id, name, symbol } = c
    if (typeof id !== 'string' || !COIN_ID_RE.test(id)) continue
    if (typeof name !== 'string' || typeof symbol !== 'string' || !name.trim() || !symbol.trim()) continue
    out.push({
      id,
      name: name.trim().slice(0, 200),
      symbol: symbol.trim().toUpperCase().slice(0, 50),
      marketCapRank: typeof c.market_cap_rank === 'number' ? c.market_cap_rank : null,
      thumb: typeof c.thumb === 'string' && c.thumb.startsWith('https://') ? c.thumb : null,
    })
  }
  return out.slice(0, 25)
}

export async function searchCoins(query: string, signal?: AbortSignal): Promise<CoinSearchResult[]> {
  const q = query.trim().slice(0, 64)
  if (!q) return []
  return parseSearchResponse(await request({ kind: 'search', query: q }, signal))
}

/**
 * Validate a /coins/{id}/market_chart payload into one close per UTC day, oldest first.
 * With interval=daily the last point is the latest price, so "today" holds the current price.
 */
export function parseHistoryResponse(payload: unknown): DailyClose[] {
  if (!isRecord(payload) || !Array.isArray(payload.prices)) {
    throw new MarketDataError('malformed', 'History response has no prices array')
  }
  const byDate = new Map<string, string>()
  for (const point of payload.prices) {
    if (!Array.isArray(point) || point.length < 2) continue
    const [ms, price] = point as [unknown, unknown]
    if (typeof ms !== 'number' || !Number.isFinite(ms) || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue
    byDate.set(new Date(ms).toISOString().slice(0, 10), new D(price).toString())
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, close]) => ({ date, close }))
}

/** Daily USD closes for one coin over the last `days` days. */
export async function fetchPriceHistory(coinId: string, days: number, signal?: AbortSignal): Promise<DailyClose[]> {
  const id = coinId.trim().toLowerCase()
  if (!COIN_ID_RE.test(id)) throw new MarketDataError('config', 'Invalid coin id')
  const n = Math.max(1, Math.min(MAX_HISTORY_DAYS, Math.round(days)))
  return parseHistoryResponse(await request({ kind: 'history', id, days: n }, signal))
}
