/**
 * In-memory stand-ins for the Supabase-backed services and the CoinGecko
 * service, used by component/integration tests. They follow the same rules as
 * the database (derived status, oversell protection, note versioning).
 *
 * Must not import any module that the tests mock (it is loaded from inside
 * vi.mock factories), or the mock resolution deadlocks.
 */
import { vi } from 'vitest'
import { D } from '@/lib/decimal'
import { ConflictError, AppError } from '@/lib/errors'
import type { Investment, InvestmentInput, Sale, SaleInput } from '@/features/investments/investments.types'
import type { PortfolioNote } from '@/features/notes/notes.service'
import type { CoinSearchResult, PriceSnapshot } from '@/features/prices/prices.types'

let seq = 0
const id = (p: string) => `${p}-${++seq}`
const now = () => new Date().toISOString()

export const backend = {
  investments: [] as Investment[],
  note: { note: '', version: 1, updatedAt: now() } as PortfolioNote,
  prices: { bitcoin: '50000', ethereum: '3000', solana: '150' } as Record<string, string>,
  /** Error thrown by the next price fetches (e.g. a MarketDataError). */
  priceError: null as Error | null,
  searchResults: [] as CoinSearchResult[],
}

export function resetBackend() {
  backend.investments = []
  backend.note = { note: '', version: 1, updatedAt: now() }
  backend.prices = { bitcoin: '50000', ethereum: '3000', solana: '150' }
  backend.priceError = null
  backend.searchResults = []
}

function recomputeStatus(inv: Investment) {
  const sold = inv.sales.reduce((acc, s) => acc.plus(s.quantity), new D(0))
  inv.status = sold.eq(inv.quantity) ? 'SOLD' : 'HOLDING'
}

export function seedInvestment(partial: Partial<Investment> & Pick<Investment, 'coinId' | 'coinName' | 'symbol'>): Investment {
  const inv: Investment = {
    id: id('inv'),
    buyDate: '2024-01-15',
    buyPrice: '100',
    quantity: '1',
    buyFee: '0',
    status: 'HOLDING',
    longTerm: false,
    note: null,
    createdAt: now(),
    updatedAt: now(),
    sales: [],
    ...partial,
  }
  recomputeStatus(inv)
  backend.investments.push(inv)
  return inv
}

const clone = <T>(v: T): T => structuredClone(v)

export const investmentsServiceMock = {
  fetchInvestments: vi.fn(async () => clone([...backend.investments].sort((a, b) => b.buyDate.localeCompare(a.buyDate)))),
  createInvestment: vi.fn(async (input: InvestmentInput) => {
    const inv = seedInvestment({ ...input, note: input.note })
    return inv.id
  }),
  updateInvestment: vi.fn(async (invId: string, input: InvestmentInput) => {
    const inv = backend.investments.find((i) => i.id === invId)
    if (!inv) throw new AppError('The record was not found. It may have been deleted.')
    Object.assign(inv, input, { updatedAt: now() })
    recomputeStatus(inv)
  }),
  updateInvestmentNote: vi.fn(async (invId: string, note: string | null) => {
    const inv = backend.investments.find((i) => i.id === invId)
    if (inv) inv.note = note?.trim() || null
  }),
  deleteInvestment: vi.fn(async (invId: string) => {
    backend.investments = backend.investments.filter((i) => i.id !== invId)
  }),
  createSale: vi.fn(async (input: SaleInput) => {
    const inv = backend.investments.find((i) => i.id === input.investmentId)
    if (!inv) throw new AppError('Investment not found.')
    const sold = inv.sales.reduce((acc, s) => acc.plus(s.quantity), new D(0))
    if (sold.plus(input.quantity).gt(inv.quantity)) {
      throw new AppError('Sale quantity exceeds the remaining quantity of this investment.')
    }
    const sale: Sale = { id: id('sale'), createdAt: now(), ...input }
    inv.sales.push(sale)
    recomputeStatus(inv)
  }),
  deleteSale: vi.fn(async (saleId: string) => {
    for (const inv of backend.investments) {
      inv.sales = inv.sales.filter((s) => s.id !== saleId)
      recomputeStatus(inv)
    }
  }),
}

export const notesServiceMock = {
  fetchPortfolioNote: vi.fn(async () => clone(backend.note)),
  savePortfolioNote: vi.fn(async (note: string, expectedVersion: number) => {
    if (expectedVersion !== backend.note.version) {
      throw new ConflictError('This note was changed on another device.', clone(backend.note))
    }
    backend.note = { note, version: backend.note.version + 1, updatedAt: now() }
    return clone(backend.note)
  }),
}

export const fetchPricesMock = vi.fn(async (ids: Iterable<string>): Promise<PriceSnapshot> => {
  if (backend.priceError) throw backend.priceError
  const prices: PriceSnapshot['prices'] = {}
  for (const coin of ids) {
    const p = backend.prices[coin]
    if (p !== undefined) prices[coin] = { usd: p, lastUpdatedAt: Date.now() }
  }
  return { prices, fetchedAt: Date.now() }
})

export const searchCoinsMock = vi.fn(async (q: string) =>
  backend.searchResults.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.symbol.toLowerCase().includes(q.toLowerCase())),
)

/** Minimal Supabase client: only what the UI touches outside the services (Realtime). */
export const fakeSupabase = {
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch }
    return ch
  },
  removeChannel: async () => 'ok',
}
