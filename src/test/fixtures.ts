import { D } from '@/lib/decimal'
import type { Investment, Sale } from '@/features/investments/investments.types'
import type { PriceLookup, PriceQuote } from '@/features/prices/prices.types'

let seq = 0
const nextId = (prefix: string) => `${prefix}-${++seq}`

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: nextId('sale'),
    investmentId: 'inv',
    soldDate: '2024-06-01',
    quantity: '1',
    price: '100',
    fee: '0',
    note: null,
    createdAt: '2024-06-01T00:00:00Z',
    ...overrides,
  }
}

export function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  const id = overrides.id ?? nextId('inv')
  return {
    id,
    coinId: 'bitcoin',
    coinName: 'Bitcoin',
    symbol: 'BTC',
    buyDate: '2024-01-01',
    buyPrice: '100',
    quantity: '1',
    buyFee: '0',
    status: 'HOLDING',
    longTerm: false,
    sortOrder: seq,
    note: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    sales: [],
    ...overrides,
  }
}

/** Build a PriceLookup from a map of coinId -> USD price string. Coins not in the map are unavailable. */
export function priceLookup(prices: Record<string, string>, status: 'live' | 'stale' = 'live'): PriceLookup {
  return (coinId: string): PriceQuote => {
    const p = prices[coinId]
    if (p === undefined) return { status: 'unavailable', price: null, fetchedAt: 1, providerUpdatedAt: null }
    return { status, price: new D(p), fetchedAt: 1, providerUpdatedAt: null }
  }
}
