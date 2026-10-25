// Supabase Edge Function: authenticated, allow-listed CoinGecko proxy.
//
// Keeps the CoinGecko API key server-side. Only three operations are exposed:
//   { "endpoint": "price",  "ids": ["bitcoin", "ethereum"] }   -> /simple/price (USD)
//   { "endpoint": "search", "query": "pepe" }                  -> /search
//   { "endpoint": "history", "id": "ethereum", "days": 120 }   -> /coins/{id}/market_chart (daily, USD)
// Anything else is rejected. Requests must carry a valid Supabase user JWT
// (verify_jwt is on by default for deployed functions), and are rate limited
// per user and cached per isolate.
//
// Secrets:
//   supabase secrets set COINGECKO_API_KEY=<key> COINGECKO_PLAN=demo   # or "pro"
//
// Deploy:
//   supabase functions deploy coingecko-proxy

import { createClient } from 'npm:@supabase/supabase-js@2'

const API_KEY = Deno.env.get('COINGECKO_API_KEY') ?? ''
const PLAN = (Deno.env.get('COINGECKO_PLAN') ?? 'demo').toLowerCase() === 'pro' ? 'pro' : 'demo'
const BASE = PLAN === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3'
const KEY_HEADER = PLAN === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '*').split(',').map((s) => s.trim()).filter(Boolean)

const COIN_ID_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/
const MAX_IDS = 100
const MAX_QUERY = 64
const PRICE_TTL_MS = 30_000
const SEARCH_TTL_MS = 10 * 60_000
const HISTORY_TTL_MS = 15 * 60_000
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30 // requests per user per minute per isolate

const cache = new Map<string, { expires: number; body: string }>()
const hits = new Map<string, number[]>()

function corsHeaders(origin: string | null): HeadersInit {
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(status: number, body: unknown, origin: string | null, extra: HeadersInit = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(origin), ...extra },
  })
}

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > RATE_MAX
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, origin)

  // Identify the caller from their Supabase JWT.
  const authHeader = req.headers.get('authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json(401, { error: 'Unauthorized' }, origin)
  if (rateLimited(userData.user.id)) return json(429, { error: 'Too many requests' }, origin, { 'retry-after': '60' })

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON' }, origin)
  }
  if (typeof payload !== 'object' || payload === null) return json(400, { error: 'Invalid body' }, origin)
  const body = payload as Record<string, unknown>

  let url: URL
  let ttl: number
  if (body.endpoint === 'price') {
    const ids = Array.isArray(body.ids) ? body.ids : []
    if (ids.length === 0 || ids.length > MAX_IDS || !ids.every((id) => typeof id === 'string' && COIN_ID_RE.test(id))) {
      return json(400, { error: 'Invalid ids' }, origin)
    }
    url = new URL(`${BASE}/simple/price`)
    url.searchParams.set('ids', [...new Set(ids as string[])].sort().join(','))
    url.searchParams.set('vs_currencies', 'usd')
    url.searchParams.set('include_last_updated_at', 'true')
    url.searchParams.set('precision', 'full')
    ttl = PRICE_TTL_MS
  } else if (body.endpoint === 'search') {
    const q = typeof body.query === 'string' ? body.query.trim() : ''
    if (!q || q.length > MAX_QUERY) return json(400, { error: 'Invalid query' }, origin)
    url = new URL(`${BASE}/search`)
    url.searchParams.set('query', q)
    ttl = SEARCH_TTL_MS
  } else if (body.endpoint === 'history') {
    const id = typeof body.id === 'string' ? body.id : ''
    const days = typeof body.days === 'number' && Number.isInteger(body.days) ? body.days : 0
    if (!COIN_ID_RE.test(id) || days < 1 || days > 365) return json(400, { error: 'Invalid history request' }, origin)
    url = new URL(`${BASE}/coins/${id}/market_chart`)
    url.searchParams.set('vs_currency', 'usd')
    url.searchParams.set('days', String(days))
    url.searchParams.set('interval', 'daily')
    ttl = HISTORY_TTL_MS
  } else {
    return json(400, { error: 'Unsupported endpoint' }, origin)
  }

  const cacheKey = url.toString()
  const cached = cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return json(200, cached.body, origin, { 'x-cache': 'HIT' })

  const headers: Record<string, string> = { accept: 'application/json' }
  if (API_KEY) headers[KEY_HEADER] = API_KEY

  let upstream: Response
  try {
    upstream = await fetch(url, { headers })
  } catch {
    return json(502, { error: 'Upstream unavailable' }, origin)
  }
  if (upstream.status === 429) {
    return json(429, { error: 'Upstream rate limited' }, origin, { 'retry-after': upstream.headers.get('retry-after') ?? '60' })
  }
  if (!upstream.ok) return json(502, { error: `Upstream error ${upstream.status}` }, origin)

  const text = await upstream.text()
  try {
    JSON.parse(text)
  } catch {
    return json(502, { error: 'Malformed upstream response' }, origin)
  }
  cache.set(cacheKey, { expires: Date.now() + ttl, body: text })
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return json(200, text, origin, { 'x-cache': 'MISS' })
})
