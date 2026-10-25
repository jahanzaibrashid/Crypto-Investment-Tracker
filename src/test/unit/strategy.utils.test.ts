import { describe, expect, it } from 'vitest'
import { D } from '@/lib/decimal'
import { computeLot } from '@/features/investments/investments.utils'
import type { Investment } from '@/features/investments/investments.types'
import type { TradingCycle } from '@/features/strategy/strategy.types'
import {
  addDays,
  analyzeTarget,
  buildCycleProgress,
  cycleEndDate,
  daysBetween,
  feeShareOfTarget,
  realizedByDate,
  realizedTrades,
  riskLevel,
} from '@/features/strategy/strategy.utils'
import { makeInvestment, makeSale, priceLookup } from '../fixtures'

const d = (v: string | number) => new D(v)
const s = (v: { toString(): string } | null) => (v === null ? null : v.toString())

function cycle(overrides: Partial<TradingCycle> = {}): TradingCycle {
  return {
    id: 'c1',
    startDate: '2026-10-01',
    lengthDays: 30,
    capital: '1000',
    dailyTarget: '30',
    feeRate: '0.1',
    closedOn: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

/** A lot bought at $100/coin; each sale of 1 coin at `100 + pl` realizes exactly `pl`. */
function lotWithSales(sales: { date: string; pl: number; fee?: string }[], overrides: Partial<Investment> = {}): Investment {
  const id = overrides.id ?? `lot-${Math.random()}`
  return makeInvestment({
    id,
    buyDate: '2026-01-01',
    buyPrice: '100',
    quantity: '100',
    sales: sales.map((x, i) =>
      makeSale({ id: `${id}-s${i}`, investmentId: id, soldDate: x.date, quantity: '1', price: String(100 + x.pl), fee: x.fee ?? '0' }),
    ),
    ...overrides,
  })
}

function progress(investments: Investment[], today: string, c: TradingCycle = cycle()) {
  const lots = investments.map((i) => computeLot(i, priceLookup({ bitcoin: '1000000' })))
  return buildCycleProgress(c, realizedByDate(realizedTrades(lots)), today)
}

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-10-01', '2026-10-30')).toBe(29)
  })

  it('a cycle ends after its length, or when it was closed early', () => {
    expect(cycleEndDate(cycle())).toBe('2026-10-30')
    expect(cycleEndDate(cycle({ closedOn: '2026-10-10' }))).toBe('2026-10-10')
  })
})

describe('daily target carry-over', () => {
  it('matches the specification example: $30 base, $20 then $50 realized', () => {
    const p = progress([lotWithSales([{ date: '2026-10-01', pl: 20 }, { date: '2026-10-02', pl: 50 }])], '2026-10-03')
    const [d1, d2, d3] = p.days

    expect(s(d1!.adjustedTarget)).toBe('30')
    expect(s(d1!.actual)).toBe('20')
    expect(s(d1!.remaining)).toBe('10')

    expect(s(d2!.carryIn)).toBe('10') // previous shortfall
    expect(s(d2!.adjustedTarget)).toBe('40')
    expect(s(d2!.actual)).toBe('50')
    expect(s(d2!.remaining)).toBe('0')
    expect(s(d2!.surplus)).toBe('10')

    expect(s(d3!.carryIn)).toBe('-10') // surplus credit
    expect(s(d3!.adjustedTarget)).toBe('20')
    expect(d3!.status).toBe('today')
    expect(s(d3!.remaining)).toBe('20')
  })

  it('a losing day adds its loss to the outstanding target', () => {
    const p = progress([lotWithSales([{ date: '2026-10-01', pl: -15 }])], '2026-10-02')
    expect(s(p.days[0]!.carryOut)).toBe('45')
    expect(s(p.days[1]!.adjustedTarget)).toBe('75')
    expect(p.losingDays).toBe(1)
  })

  it('a day without sales counts as $0', () => {
    const p = progress([], '2026-10-03')
    expect(s(p.days[2]!.adjustedTarget)).toBe('90')
    expect(p.flatDays).toBe(2) // today isn't finished, so it isn't counted
  })

  it('a surplus bigger than one day keeps rolling forward, never below a $0 target', () => {
    const p = progress([lotWithSales([{ date: '2026-10-01', pl: 100 }])], '2026-10-04')
    expect(s(p.days[1]!.carryIn)).toBe('-70')
    expect(s(p.days[1]!.adjustedTarget)).toBe('0')
    expect(s(p.days[2]!.carryIn)).toBe('-40')
    expect(s(p.days[2]!.adjustedTarget)).toBe('0')
    expect(s(p.days[3]!.carryIn)).toBe('-10')
    expect(s(p.days[3]!.adjustedTarget)).toBe('20')
  })

  it('carry always equals cumulative target − cumulative actual (nothing counted twice)', () => {
    const p = progress(
      [lotWithSales([{ date: '2026-10-01', pl: 12 }, { date: '2026-10-02', pl: -40 }, { date: '2026-10-02', pl: 95 }, { date: '2026-10-05', pl: 7 }])],
      '2026-10-08',
    )
    for (const day of p.days.filter((x) => x.status !== 'upcoming')) {
      expect(s(day.carryOut)).toBe(s(day.cumulativeTarget.minus(day.cumulativeActual!)))
    }
    expect(s(p.days[1]!.actual)).toBe('55') // two sales on the same day are added
    expect(s(p.realizedPL)).toBe('74')
    expect(s(p.cumulativeTarget)).toBe('240')
    expect(s(p.outstanding)).toBe('166')
  })
})

describe('realized trades from investment records', () => {
  it('counts each sale once, even if a lot appears twice', () => {
    const inv = lotWithSales([{ date: '2026-10-01', pl: 20 }], { id: 'dup' })
    const lots = [inv, inv].map((i) => computeLot(i, priceLookup({})))
    expect(realizedTrades(lots)).toHaveLength(1)
  })

  it('ignores unrealized P/L of coins still held', () => {
    const open = makeInvestment({ buyDate: '2026-10-01', buyPrice: '100', quantity: '5' }) // price below is far above cost
    const p = progress([open], '2026-10-02')
    expect(s(p.realizedPL)).toBe('0')
    expect(p.tradeCount).toBe(0)
  })

  it('ignores sales outside the cycle dates', () => {
    const p = progress([lotWithSales([{ date: '2026-09-30', pl: 500 }, { date: '2026-10-31', pl: 500 }, { date: '2026-10-01', pl: 5 }])], '2026-11-05')
    expect(s(p.realizedPL)).toBe('5')
    expect(p.status).toBe('ended')
  })

  it('uses realized P/L net of fees and reports sale fee + allocated buy fee', () => {
    // 10 coins for $1,000 + $10 buy fee; sell 1 at $150 with a $2 fee.
    const inv = makeInvestment({
      id: 'fee-lot',
      buyDate: '2026-01-01',
      buyPrice: '100',
      quantity: '10',
      buyFee: '10',
      sales: [makeSale({ id: 'fee-sale', investmentId: 'fee-lot', soldDate: '2026-10-01', quantity: '1', price: '150', fee: '2' })],
    })
    const [trade] = realizedTrades([computeLot(inv, priceLookup({}))])
    expect(s(trade!.realizedPL)).toBe('47') // 150 − 2 − (1010 × 1/10)
    expect(s(trade!.fees)).toBe('3') // 2 + 10 × 1/10
    expect(s(progress([inv], '2026-10-02').fees)).toBe('3')
  })
})

describe('cycle summary', () => {
  it('reports day, progress and profitable/losing days for an active cycle', () => {
    const p = progress([lotWithSales([{ date: '2026-10-01', pl: 45 }, { date: '2026-10-02', pl: -10 }, { date: '2026-10-03', pl: 30 }])], '2026-10-03')
    expect(p.status).toBe('active')
    expect(p.currentDay).toBe(3)
    expect(p.totalDays).toBe(30)
    expect(s(p.cycleTarget)).toBe('900')
    expect(s(p.realizedPL)).toBe('65')
    expect(s(p.cumulativeReturnPct)).toBe('6.5')
    expect(p.profitableDays).toBe(2)
    expect(p.losingDays).toBe(1)
    expect(s(p.today!.dailyReturnPct)).toBe('3')
  })

  it('an upcoming cycle has no results yet', () => {
    const p = progress([], '2026-09-20')
    expect(p.status).toBe('upcoming')
    expect(p.elapsedDays).toBe(0)
    expect(p.days.every((x) => x.actual === null)).toBe(true)
  })

  it('a closed cycle stops on its closing date', () => {
    const p = progress([lotWithSales([{ date: '2026-10-06', pl: 99 }])], '2026-10-20', cycle({ closedOn: '2026-10-05' }))
    expect(p.totalDays).toBe(5)
    expect(s(p.realizedPL)).toBe('0')
    expect(s(p.outstanding)).toBe('150')
  })
})

describe('target analysis', () => {
  const base = { capital: d(1000), dailyTarget: d(30), days: 30 }

  it('$1,000 and $30/day needs 3% a day before fees', () => {
    const a = analyzeTarget(base)
    expect(s(a.dailyReturnPct)).toBe('3')
    expect(s(a.cycleProfit)).toBe('900')
    expect(s(a.cycleReturnPct)).toBe('90')
    expect(a.compoundedCycleReturnPct.toFixed(2)).toBe('142.73')
    expect(a.riskLevel).toBe('very-high')
  })

  it('builds drawdown scenarios from shares of the capital', () => {
    const [ten, twenty, thirty, fifty] = analyzeTarget(base).drawdowns
    expect(s(ten!.loss)).toBe('100')
    expect(ten!.recoveryGainPct.toFixed(2)).toBe('11.11') // 100 / 900
    expect(twenty!.recoveryGainPct.toFixed(2)).toBe('25.00')
    expect(thirty!.daysOfTarget.toFixed(1)).toBe('10.0') // $300 / $30
    expect(s(fifty!.recoveryGainPct)).toBe('100')
  })

  it('classifies risk by the required daily return', () => {
    expect(riskLevel(d('0.05'))).toBe('low')
    expect(riskLevel(d('0.1'))).toBe('moderate')
    expect(riskLevel(d('0.5'))).toBe('high')
    expect(riskLevel(d('3'))).toBe('very-high')
  })

  it('fee share of target for a strategy frequency', () => {
    // 10 round trips × $1,000 × 0.2% = $20 = 66.67% of $30
    expect(feeShareOfTarget(d(1000), d(30), d('0.1'), 10).toFixed(2)).toBe('66.67')
  })
})
