import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, NO_EXCHANGE, filterLots, hasActiveFilters, soldPeriodOptions, soldPeriodRange } from '@/features/investments/investments.filters'
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
  it('runs today, this week (from Monday), this month and this year up to today', () => {
    expect(soldPeriodRange('TODAY', TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(soldPeriodRange('THIS_WEEK', TODAY)).toEqual({ from: '2026-10-19', to: TODAY }) // TODAY is a Monday
    expect(soldPeriodRange('THIS_WEEK', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' }) // Sunday
    expect(soldPeriodRange('THIS_MONTH', TODAY)).toEqual({ from: '2026-10-01', to: TODAY })
    expect(soldPeriodRange('THIS_YEAR', TODAY)).toEqual({ from: '2026-01-01', to: TODAY })
  })
  it('is null for all time', () => {
    expect(soldPeriodRange('', TODAY)).toBeNull()
  })
})

describe('soldPeriodOptions', () => {
  it("lists the fixed periods, then every earlier month back to the user's first closed sale, newest first", () => {
    const values = soldPeriodOptions([lot('2025-06-10'), lot(null)], TODAY).map((o) => o.value)
    expect(values.slice(0, 6)).toEqual(['', 'TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_YEAR', '2026-09'])
    expect(values.at(-1)).toBe('2025-06')
    expect(values).toHaveLength(5 + 9 + 7) // Sep…Jan 2026 + Dec…Jun 2025 (October is "This month")
  })
  it('lists no months to a user without sales before this month (e.g. a new account)', () => {
    expect(soldPeriodOptions([], TODAY).slice(5)).toEqual([])
    expect(soldPeriodOptions([lot(null)], TODAY).slice(5)).toEqual([])
    expect(soldPeriodOptions([lot('2026-10-05')], TODAY).slice(5)).toEqual([])
  })
  it('ignores partial sales: they never match a month in the filter', () => {
    const partlySoldLastYear = lot('2025-03-01', { qty: '2', sold: '1' })
    expect(soldPeriodOptions([partlySoldLastYear], TODAY).slice(5)).toEqual([])
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
    const totals = summarizePortfolio(filterLots(all, { ...EMPTY_FILTERS, soldIn: 'THIS_YEAR' }, TODAY))
    // October: +50 (sold at 150), September 30: −50 (sold at 50) → 0
    expect(totals.totalPL?.toString()).toBe('0')
    expect(totals.openLotCount).toBe(0)
  })

  it('leaves the list alone for all time', () => {
    expect(filterLots(all, EMPTY_FILTERS, TODAY)).toEqual(all)
  })
})

describe('filterLots by exchange ("Bought on")', () => {
  const on = (exchange: string | null, soldDate: string | null = null) =>
    computeLot(makeInvestment({ exchange, sales: soldDate ? [makeSale({ soldDate, quantity: '1', price: '150' })] : [] }), prices)
  const binanceSoldOct = on('Binance', '2026-10-02')
  const binanceHeld = on('Binance')
  const metamask = on('MetaMask', '2026-10-03')
  const unset = on(null)
  const all = [binanceSoldOct, binanceHeld, metamask, unset]

  it('keeps one platform (ignoring case)', () => {
    const f = { ...EMPTY_FILTERS, exchange: 'binance' }
    expect(hasActiveFilters(f)).toBe(true)
    expect(filterLots(all, f, TODAY)).toEqual([binanceSoldOct, binanceHeld])
  })
  it('finds investments with no platform set', () => {
    expect(filterLots(all, { ...EMPTY_FILTERS, exchange: NO_EXCHANGE }, TODAY)).toEqual([unset])
  })
  it('combines with the sale period', () => {
    expect(filterLots(all, { ...EMPTY_FILTERS, exchange: 'Binance', soldIn: '2026-10' }, TODAY)).toEqual([binanceSoldOct])
  })
})
