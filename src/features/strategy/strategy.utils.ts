/**
 * Pure trading-target math. No I/O, no React. All arithmetic uses decimal.js. USD throughout.
 *
 * Actual results come from the existing realized P/L of each sale (investments.utils
 * computeSale): net sale proceeds − cost basis allocated to the sold units. Buy and sale
 * fees are therefore already deducted. Unrealized P/L of open positions is never used.
 * Each sale is counted once, on its sale date.
 *
 * Carry-over (Adjusted Target = Base + Previous Shortfall − Previous Surplus Credit):
 *   carry₁            = 0
 *   adjustedTarget_d  = max(0, base + carry_d)
 *   carry_{d+1}       = base + carry_d − actual_d      (> 0 shortfall, < 0 surplus credit)
 * so carry_{d+1} = cumulative target − cumulative actual: nothing is counted twice.
 *   * A losing day adds its loss to the outstanding amount.
 *   * A surplus bigger than one day's target keeps rolling forward (that day's target shows $0).
 *   * A day without sales counts as $0.
 *   * Whatever is outstanding when a cycle ends is reported, not carried into the next cycle.
 */
import { D, HUNDRED, ZERO, dec, sum, type Dec } from '@/lib/decimal'
import type { LotMetrics } from '@/features/investments/investments.utils'
import type { TradingCycle } from './strategy.types'

// ---------------------------------------------------------------------------------------------
// Calendar dates (YYYY-MM-DD, no timezone shifting)
// ---------------------------------------------------------------------------------------------

function utc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** Last day of a cycle: the planned end, or the day it was closed early. */
export function cycleEndDate(c: Pick<TradingCycle, 'startDate' | 'lengthDays' | 'closedOn'>): string {
  const planned = addDays(c.startDate, c.lengthDays - 1)
  return c.closedOn !== null && c.closedOn < planned ? c.closedOn : planned
}

// ---------------------------------------------------------------------------------------------
// Realized trades from the existing investment records
// ---------------------------------------------------------------------------------------------

export interface RealizedTrade {
  saleId: string
  investmentId: string
  coinName: string
  symbol: string
  soldDate: string
  quantity: Dec
  netProceeds: Dec
  /** Cost basis allocated to the sold units (buy fee share included). */
  costBasis: Dec
  realizedPL: Dec
  /** Sale fee + the share of the lot's buy fee allocated to this sale. */
  fees: Dec
}

export interface DailyRealized {
  date: string
  realizedPL: Dec
  fees: Dec
  trades: RealizedTrade[]
}

/** Every sale once (by sale id), with its realized P/L and fees. */
export function realizedTrades(lots: LotMetrics[]): RealizedTrade[] {
  const seen = new Set<string>()
  const trades: RealizedTrade[] = []
  for (const lot of lots) {
    for (const s of lot.sales) {
      if (seen.has(s.sale.id)) continue
      seen.add(s.sale.id)
      const buyFeeShare = lot.quantity.isZero() ? ZERO : lot.buyFee.times(s.quantity).dividedBy(lot.quantity)
      trades.push({
        saleId: s.sale.id,
        investmentId: lot.investment.id,
        coinName: lot.investment.coinName,
        symbol: lot.investment.symbol,
        soldDate: s.sale.soldDate,
        quantity: s.quantity,
        netProceeds: s.netProceeds,
        costBasis: s.allocatedCostBasis,
        realizedPL: s.realizedPL,
        fees: s.fee.plus(buyFeeShare),
      })
    }
  }
  return trades
}

/** Realized P/L grouped by sale date. */
export function realizedByDate(trades: RealizedTrade[]): Map<string, DailyRealized> {
  const map = new Map<string, DailyRealized>()
  for (const t of trades) {
    const day = map.get(t.soldDate) ?? { date: t.soldDate, realizedPL: ZERO, fees: ZERO, trades: [] }
    day.realizedPL = day.realizedPL.plus(t.realizedPL)
    day.fees = day.fees.plus(t.fees)
    day.trades.push(t)
    map.set(t.soldDate, day)
  }
  return map
}

// ---------------------------------------------------------------------------------------------
// Daily target tracker
// ---------------------------------------------------------------------------------------------

/** done = a past day; today = still open; upcoming = not reached yet (no result). */
export type DayStatus = 'done' | 'today' | 'upcoming'

export interface TrackerDay {
  day: number
  date: string
  status: DayStatus
  baseTarget: Dec
  /** Carried in from earlier days: > 0 unrecovered shortfall, < 0 surplus credit. null when upcoming. */
  carryIn: Dec | null
  adjustedTarget: Dec | null
  actual: Dec | null
  /** Still needed today: max(0, adjusted − actual). */
  remaining: Dec | null
  /** Above today's adjusted target: max(0, actual − adjusted). */
  surplus: Dec | null
  /** Carried into the next day (provisional for today). */
  carryOut: Dec | null
  fees: Dec
  trades: RealizedTrade[]
  /** actual ÷ capital × 100 */
  dailyReturnPct: Dec | null
  /** base × day */
  cumulativeTarget: Dec
  cumulativeActual: Dec | null
  cumulativeReturnPct: Dec | null
}

export type CycleStatus = 'upcoming' | 'active' | 'ended'

export interface CycleProgress {
  cycle: TradingCycle
  endDate: string
  totalDays: number
  status: CycleStatus
  /** Day number of today within an active cycle. */
  currentDay: number | null
  /** Days up to and including today (0 before the start, totalDays after the end). */
  elapsedDays: number
  /** null when the cycle has no capital set. */
  capital: Dec | null
  baseTarget: Dec
  /** base × totalDays */
  cycleTarget: Dec
  realizedPL: Dec
  fees: Dec
  tradeCount: number
  today: TrackerDay | null
  /** base × elapsed days */
  cumulativeTarget: Dec
  /** cumulative target − realized P/L: > 0 shortfall, < 0 ahead of target. */
  outstanding: Dec
  profitableDays: number
  losingDays: number
  /** Finished days with no realized P/L. */
  flatDays: number
  /** null when the cycle has no capital set. */
  cumulativeReturnPct: Dec | null
  /** realized P/L ÷ cycle target × 100 (can be negative or above 100). */
  progressPct: Dec
  days: TrackerDay[]
}

const pct = (value: Dec, of: Dec | null): Dec | null => (of === null ? null : of.isZero() ? ZERO : value.dividedBy(of).times(HUNDRED))

export function buildCycleProgress(cycle: TradingCycle, byDate: Map<string, DailyRealized>, today: string): CycleProgress {
  const capital = cycle.capital === null ? null : dec(cycle.capital)
  const base = dec(cycle.dailyTarget)
  const endDate = cycleEndDate(cycle)
  const totalDays = daysBetween(cycle.startDate, endDate) + 1

  const days: TrackerDay[] = []
  let carry = ZERO
  let cumulative = ZERO
  for (let i = 0; i < totalDays; i++) {
    const date = addDays(cycle.startDate, i)
    const status: DayStatus = date < today ? 'done' : date === today ? 'today' : 'upcoming'
    const realized = byDate.get(date)
    const cumulativeTarget = base.times(i + 1)
    if (status === 'upcoming') {
      days.push({
        day: i + 1,
        date,
        status,
        baseTarget: base,
        carryIn: null,
        adjustedTarget: null,
        actual: null,
        remaining: null,
        surplus: null,
        carryOut: null,
        fees: ZERO,
        trades: [],
        dailyReturnPct: null,
        cumulativeTarget,
        cumulativeActual: null,
        cumulativeReturnPct: null,
      })
      continue
    }
    const actual = realized?.realizedPL ?? ZERO
    const owed = base.plus(carry)
    const adjusted = D.max(owed, ZERO)
    const carryOut = owed.minus(actual)
    cumulative = cumulative.plus(actual)
    days.push({
      day: i + 1,
      date,
      status,
      baseTarget: base,
      carryIn: carry,
      adjustedTarget: adjusted,
      actual,
      remaining: D.max(adjusted.minus(actual), ZERO),
      surplus: D.max(actual.minus(adjusted), ZERO),
      carryOut,
      fees: realized?.fees ?? ZERO,
      trades: realized?.trades ?? [],
      dailyReturnPct: pct(actual, capital),
      cumulativeTarget,
      cumulativeActual: cumulative,
      cumulativeReturnPct: pct(cumulative, capital),
    })
    carry = carryOut
  }

  const reached = days.filter((d) => d.status !== 'upcoming')
  const elapsedDays = reached.length
  const status: CycleStatus = today < cycle.startDate ? 'upcoming' : today > endDate ? 'ended' : 'active'
  const todayRow = days.find((d) => d.status === 'today') ?? null
  const cumulativeTarget = base.times(elapsedDays)
  const realizedPL = sum(reached.map((d) => d.actual!))

  return {
    cycle,
    endDate,
    totalDays,
    status,
    currentDay: todayRow?.day ?? null,
    elapsedDays,
    capital,
    baseTarget: base,
    cycleTarget: base.times(totalDays),
    realizedPL,
    fees: sum(reached.map((d) => d.fees)),
    tradeCount: reached.reduce((n, d) => n + d.trades.length, 0),
    today: todayRow,
    cumulativeTarget,
    outstanding: cumulativeTarget.minus(realizedPL),
    profitableDays: reached.filter((d) => d.actual!.gt(0)).length,
    losingDays: reached.filter((d) => d.actual!.lt(0)).length,
    flatDays: reached.filter((d) => d.status === 'done' && d.actual!.isZero()).length,
    cumulativeReturnPct: pct(realizedPL, capital),
    progressPct: pct(realizedPL, base.times(totalDays)) ?? ZERO,
    days,
  }
}
