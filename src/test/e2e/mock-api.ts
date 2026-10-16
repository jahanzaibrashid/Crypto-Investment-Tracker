/**
 * Network-level fakes for Playwright: a tiny in-memory Supabase (Auth +
 * PostgREST subset used by the app) and CoinGecko. Each test gets its own
 * state, so tests are isolated and never depend on live services or prices.
 */
import type { Page, Route } from '@playwright/test'

export const SUPABASE_URL = 'http://fake-supabase.test'

interface User {
  id: string
  email: string
  password: string
}

type Row = Record<string, unknown>

export interface MockState {
  users: User[]
  investments: Row[]
  sales: Row[]
  notes: Row[]
  prices: Record<string, number>
  priceStatus: number
}

let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const nowIso = () => new Date().toISOString()

export function createState(): MockState {
  return {
    users: [],
    investments: [],
    sales: [],
    notes: [],
    prices: { bitcoin: 50000, ethereum: 3000, solana: 150 },
    priceStatus: 200,
  }
}

export function addUser(state: MockState, email: string, password: string): User {
  const user = { id: uid(), email, password }
  state.users.push(user)
  state.notes.push({ id: uid(), user_id: user.id, note: '', version: 1, updated_at: nowIso() })
  return user
}

function authUser(u: User) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: nowIso(),
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: nowIso(),
  }
}

function session(u: User) {
  return {
    access_token: `token-${u.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${u.id}`,
    user: authUser(u),
  }
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
    body: JSON.stringify(body),
  })
}

function currentUser(state: MockState, route: Route): User | undefined {
  const auth = route.request().headers()['authorization'] ?? ''
  const token = auth.replace(/^Bearer /, '')
  return state.users.find((u) => token === `token-${u.id}`)
}

function recomputeInvestment(state: MockState, investmentId: string) {
  const inv = state.investments.find((i) => i.id === investmentId)
  if (!inv) return
  const sales = state.sales.filter((s) => s.investment_id === investmentId)
  const sold = sales.reduce((acc, s) => acc + Number(s.quantity), 0)
  inv.status = sold > 0 && Math.abs(sold - Number(inv.quantity)) < 1e-12 ? 'SOLD' : 'HOLDING'
}

const RESERVED = new Set(['select', 'order', 'offset', 'limit', 'columns', 'on_conflict'])

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (RESERVED.has(key)) continue
    if (value.startsWith('eq.') && String(row[key]) !== value.slice(3)) return false
  }
  return true
}

/** Apply PostgREST-ish semantics to one of the fake tables, scoped to the caller (RLS). */
async function handleRest(state: MockState, route: Route, table: string) {
  const req = route.request()
  if (req.method() === 'OPTIONS') return json(route, 200, {})
  const user = currentUser(state, route)
  if (!user) return json(route, 401, { code: 'PGRST301', message: 'JWT expired' })

  const url = new URL(req.url())
  const params = url.searchParams
  const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
  const store: Row[] = table === 'investments' ? state.investments : table === 'investment_sales' ? state.sales : state.notes
  const own = () => store.filter((r) => r.user_id === user.id && matches(r, params))
  const respond = (rows: Row[], status = 200) => {
    if (wantsObject) {
      if (rows.length !== 1) return json(route, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })
      return json(route, status, rows[0])
    }
    return json(route, status, rows)
  }

  switch (req.method()) {
    case 'GET':
    case 'HEAD':
      return respond(own())
    case 'POST': {
      const body = req.postDataJSON() as Row | Row[]
      const inserted: Row[] = []
      for (const input of Array.isArray(body) ? body : [body]) {
        if (table === 'portfolio_notes' && state.notes.some((n) => n.user_id === user.id)) {
          return json(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint' })
        }
        const row: Row = { id: uid(), user_id: user.id, created_at: nowIso(), updated_at: nowIso(), ...input }
        if (table === 'investments') Object.assign(row, { status: 'HOLDING', buy_fee: row.buy_fee ?? '0', long_term: row.long_term ?? false })
        if (table === 'portfolio_notes') Object.assign(row, { version: 1 })
        if (table === 'investment_sales') {
          const inv = state.investments.find((i) => i.id === row.investment_id && i.user_id === user.id)
          if (!inv) return json(route, 400, { code: '23503', message: 'Investment not found' })
          const sold = state.sales.filter((s) => s.investment_id === inv.id).reduce((a, s) => a + Number(s.quantity), 0)
          if (sold + Number(row.quantity) > Number(inv.quantity) + 1e-12) {
            return json(route, 400, { code: '23514', message: 'Sale quantity exceeds the remaining quantity of this investment' })
          }
        }
        store.push(row)
        if (table === 'investment_sales') recomputeInvestment(state, String(row.investment_id))
        inserted.push(row)
      }
      return respond(inserted, 201)
    }
    case 'PATCH': {
      const patch = req.postDataJSON() as Row
      const rows = own()
      for (const r of rows) {
        Object.assign(r, patch, { updated_at: nowIso() })
        if (table === 'portfolio_notes') r.version = Number(r.version) + 1
        if (table === 'investments') recomputeInvestment(state, String(r.id))
      }
      return respond(rows)
    }
    case 'DELETE': {
      const rows = own()
      for (const r of rows) {
        store.splice(store.indexOf(r), 1)
        if (table === 'investments') state.sales = state.sales.filter((s) => s.investment_id !== r.id)
        if (table === 'investment_sales') recomputeInvestment(state, String(r.investment_id))
      }
      return respond(rows)
    }
    default:
      return json(route, 405, {})
  }
}

export async function installMockApi(page: Page, state: MockState) {
  // Supabase Auth
  await page.route(`${SUPABASE_URL}/auth/v1/**`, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return json(route, 200, {})
    const url = new URL(req.url())
    const path = url.pathname.replace('/auth/v1', '')

    if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
      const { email, password } = req.postDataJSON() as { email: string; password: string }
      const user = state.users.find((u) => u.email === email && u.password === password)
      if (!user) return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(route, 200, session(user))
    }
    if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      const { refresh_token } = req.postDataJSON() as { refresh_token: string }
      const user = state.users.find((u) => refresh_token === `refresh-${u.id}`)
      return user ? json(route, 200, session(user)) : json(route, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
    }
    if (path === '/signup') {
      const { email, password } = req.postDataJSON() as { email: string; password: string }
      if (state.users.some((u) => u.email === email)) {
        return json(route, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      }
      return json(route, 200, session(addUser(state, email, password)))
    }
    if (path === '/user') {
      const user = currentUser(state, route)
      return user ? json(route, 200, authUser(user)) : json(route, 401, { msg: 'invalid JWT' })
    }
    if (path === '/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    if (path === '/recover') return json(route, 200, {})
    return json(route, 404, { msg: `unmocked auth path ${path}` })
  })

  // PostgREST
  await page.route(`${SUPABASE_URL}/rest/v1/**`, (route) => {
    const table = new URL(route.request().url()).pathname.replace('/rest/v1/', '')
    return handleRest(state, route, table)
  })

  // Realtime: accept the socket and ignore it.
  await page.routeWebSocket(/fake-supabase\.test\/realtime/, () => {})

  // CoinGecko
  await page.route('https://api.coingecko.com/api/v3/**', (route) => {
    const url = new URL(route.request().url())
    if (state.priceStatus !== 200) return json(route, state.priceStatus, { error: 'mock failure' })
    if (url.pathname.endsWith('/simple/price')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      const body: Record<string, { usd: number; last_updated_at: number }> = {}
      for (const id of ids) {
        if (state.prices[id] !== undefined) body[id] = { usd: state.prices[id], last_updated_at: Math.floor(Date.now() / 1000) }
      }
      return json(route, 200, body)
    }
    if (url.pathname.endsWith('/search')) {
      return json(route, 200, {
        coins: [{ id: 'pepe', name: 'Pepe', symbol: 'PEPE', market_cap_rank: 30, thumb: null }],
      })
    }
    return json(route, 404, {})
  })
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { level: 2, name: 'Overview' }).waitFor()
}
