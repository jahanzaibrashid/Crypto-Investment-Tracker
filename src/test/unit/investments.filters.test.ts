import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, filterLots, hasActiveFilters, soldPeriodOptions, soldPeriodRange } from '@/features/investments/investments.filters'
import { computeLot, summarizePortfolio } from '@/features/investments/investments.utils'
import { makeInvestment, makeSale, priceLookup } from '../fixtures'

const TODAY = '2026-10-19'
const prices = priceLookup({ bitcoin: '200', ethereum: '200' })

/** A lot bought at $100 and sold (all of `qty`, or part of it) at `price` on `soldDate`. */
function lot(soldDate: string | null, opts: { qty?: string; sold?: string; price?: string; coinId?: string } = {}) {
  const quantity = opts.qty ?? '1'
  const sales = soldDate ? [makeSale({ soldDate, quantity: opts.sold ?? quantity, price: opts.price ?? '150' })] : []
  return computeLot(makeInvestment({ coinId: opts.coinId ?? 'bitcoin', quantity, sales }), prices)
}

describe('soldPeriodRange', () => {
  it('runs a past month from its first to its last day', () => {
    expect(soldPeriodRange('2026-01', TODAY)).toEqual({ from: '2026-01-01', to: '2026-01-31' })
    expect(soldPeriodRange('2024-02', TODAY)).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
  it('stops the current month at today', () => {
    expect(soldPeriodRange('2026-10', TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-19' })
  })
  it('uses rolling windows that end today', () => {
    expect(soldPeriodRange('LAST_WEEK', TODAY)).toEqual({ from: '2026-10-13', to: TODAY })
    expect(soldPeriodRange('LAST_MONTH', TODAY)).toEqual({ from: '2026-09-20', to: TODAY })
    expect(soldPeriodRange('LAST_YEAR', TODAY)).toEqual({ from: '2025-10-20', to: TODAY })
  })
  it('is null for all time', () => {
    expect(soldPeriodRange('', TODAY)).toBeNull()
  })
})

describe('soldPeriodOptions', () => {
  it('lists every month from January of the earliest sale year up to the current month, newest first', () => {
    const values = soldPeriodOptions([lot('2025-06-10')], TODAY).map((o) => o.value)
    expect(values.slice(0, 5)).toEqual(['', 'LAST_WEEK', 'LAST_MONTH', 'LAST_YEAR', '2026-10'])
    expect(values.at(-1)).toBe('2025-01')
    expect(values).toHaveLength(4 + 10 + 12) // Oct…Jan 2026 + all of 2025
  })
  it('always includes the current year when nothing is sold yet', () => {
    const options = soldPeriodOptions([lot(null)], TODAY)
    expect(options[4]).toEqual({ value: '2026-10', label: 'October 2026' })
    expect(options.at(-1)).toEqual({ value: '2026-01', label: 'January 2026' })
  })
})

describe('filterLots with a sale period', () => {
  const october = lot('2026-10-05')
  const lateOctoberFuture = lot('2026-10-25') // after "today": not in the current month's range yet
  const september = lot('2026-09-30', { coinId: 'ethereum', price: '50' })
  const held = lot(null)
  const partlySoldInOctober = lot('2026-10-06', { qty: '2', sold: '1' })
  const all = [october, lateOctoberFuture, september, held, partlySoldInOctober]

  it('shows only investments fully sold in the period', () => {
    const f = { ...EMPTY_FILTERS, soldIn: '2026-10' as const }
    expect(hasActiveFilters(f)).toBe(true)
    expect(filterLots(all, f, TODAY)).toEqual([october])
    expect(filterLots(all, { ...EMPTY_FILTERS, soldIn: '2026-09' }, TODAY)).toEqual([september])
  })

  it('makes the totals the realized profit/loss of that period', () => {
    const totals = summarizePortfolio(filterLots(all, { ...EMPTY_FILTERS, soldIn: 'LAST_MONTH' }, TODAY))
    // October: +50 (sold at 150), September 30: −50 (sold at 50) → 0
    expect(totals.totalPL?.toString()).toBe('0')
    expect(totals.openLotCount).toBe(0)
  })

  it('leaves the list alone for all time', () => {
    expect(filterLots(all, EMPTY_FILTERS, TODAY)).toEqual(all)
  })
})
