import { todayIso } from '@/lib/formatters'
import { lastSoldDate, positionKind, type LotMetrics, type PositionKind } from './investments.utils'

export type StatusFilter = 'ALL' | PositionKind

/**
 * "Sold in" period: '' (all time), a rolling window ending today, or a calendar month ("2026-10").
 * When set, only fully sold investments whose (last) sale falls in the period are shown.
 */
export type SoldPeriod = '' | 'LAST_WEEK' | 'LAST_MONTH' | 'LAST_YEAR' | `${number}-${number}`

export interface InvestmentFilterState {
  search: string
  status: StatusFilter
  /** Inclusive buy-date range, YYYY-MM-DD or '' */
  from: string
  to: string
  soldIn: SoldPeriod
  /** "Bought on": '' = all, NO_EXCHANGE = not set, otherwise an exchange name (case-insensitive). */
  exchange: string
}

/** Filter value for investments without an exchange. */
export const NO_EXCHANGE = '__none__'

export const EMPTY_FILTERS: InvestmentFilterState = { search: '', status: 'ALL', from: '', to: '', soldIn: '', exchange: '' }

export function hasActiveFilters(f: InvestmentFilterState): boolean {
  return f.search.trim() !== '' || f.status !== 'ALL' || f.from !== '' || f.to !== '' || f.soldIn !== '' || f.exchange !== ''
}

/** Rolling windows, in days including today. */
const ROLLING_DAYS = { LAST_WEEK: 7, LAST_MONTH: 30, LAST_YEAR: 365 } as const

/** Local calendar date `days` before the YYYY-MM-DD `iso`. */
function daysBefore(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return todayIso(new Date(y, m - 1, d - days))
}

/**
 * Inclusive sale-date range (YYYY-MM-DD) of a period, never past today: a month runs from its
 * 1st to its last day, or to today for the current month. Null for "all time" or an unknown value.
 */
export function soldPeriodRange(period: SoldPeriod, today = todayIso()): { from: string; to: string } | null {
  if (period === '') return null
  if (period in ROLLING_DAYS) {
    return { from: daysBefore(today, ROLLING_DAYS[period as keyof typeof ROLLING_DAYS] - 1), to: today }
  }
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return null
  const [y, m] = [Number(match[1]), Number(match[2])]
  const from = `${match[1]}-${match[2]}-01`
  const lastDay = todayIso(new Date(y, m, 0))
  return { from, to: lastDay < today ? lastDay : today }
}

/**
 * Dropdown options for "Sold in": all time, the rolling windows, then every month from the
 * user's first closed sale up to the current month (newest first). The months follow the user's
 * own history: an account without fully sold investments sees only the current month, and the
 * list grows by itself as time passes. Months use the same date as the filter: the sale that
 * closed a fully sold investment.
 */
export function soldPeriodOptions(lots: LotMetrics[], today = todayIso()): { value: SoldPeriod; label: string }[] {
  const [thisYear, thisMonth] = today.split('-').map(Number) as [number, number]
  let first = today.slice(0, 7) // YYYY-MM
  for (const lot of lots) {
    const closed = lot.status === 'SOLD' ? lastSoldDate(lot) : null
    if (closed && closed.slice(0, 7) < first) first = closed.slice(0, 7)
  }
  const [firstYear, firstMonth] = first.split('-').map(Number) as [number, number]
  const months: { value: SoldPeriod; label: string }[] = []
  let [y, m] = [thisYear, thisMonth]
  while (y > firstYear || (y === firstYear && m >= firstMonth)) {
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    months.push({ value: `${y}-${String(m).padStart(2, '0')}` as SoldPeriod, label })
    m -= 1
    if (m === 0) [y, m] = [y - 1, 12]
  }
  return [
    { value: '', label: 'All time' },
    { value: 'LAST_WEEK', label: 'Last week' },
    { value: 'LAST_MONTH', label: 'Last month' },
    { value: 'LAST_YEAR', label: 'Last year' },
    ...months,
  ]
}

export function filterLots(lots: LotMetrics[], f: InvestmentFilterState, today = todayIso()): LotMetrics[] {
  const q = f.search.trim().toLowerCase()
  const sold = soldPeriodRange(f.soldIn, today)
  return lots.filter((lot) => {
    const inv = lot.investment
    if (q && !inv.coinName.toLowerCase().includes(q) && !inv.symbol.toLowerCase().includes(q) && !inv.coinId.includes(q)) {
      return false
    }
    if (f.status !== 'ALL' && positionKind(lot) !== f.status) return false
    if (f.from && inv.buyDate < f.from) return false
    if (f.to && inv.buyDate > f.to) return false
    if (f.exchange === NO_EXCHANGE) {
      if (inv.exchange) return false
    } else if (f.exchange && inv.exchange?.toLowerCase() !== f.exchange.toLowerCase()) {
      return false
    }
    if (sold) {
      // Sold investments only (held and partly sold coins are left out), dated by the sale that closed them.
      const closed = lot.status === 'SOLD' ? lastSoldDate(lot) : null
      if (!closed || closed < sold.from || closed > sold.to) return false
    }
    return true
  })
}
