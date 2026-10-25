import { describe, expect, it } from 'vitest'
import type { Candle } from '@/features/analyzer/binance.service'
import { analyzeFibonacci } from '@/features/analyzer/fibonacci'

const H4 = 4 * 3_600_000

type Row = [high: number, low: number, close?: number, volume?: number]

/** Candles from rows; open = previous close (clamped into the candle). */
function build(rows: Row[]): Candle[] {
  let prev = rows[0]![1]
  return rows.map(([high, low, close, volume], i) => {
    const c = close ?? (high + low) / 2
    const open = Math.min(Math.max(prev, low), high)
    prev = c
    const v = volume ?? 10
    return { openTime: i * H4, closeTime: (i + 1) * H4 - 1, open, high, low, close: c, volume: v, quoteVolume: v * c, trades: 1, takerBuyVolume: v / 2 }
  })
}

/** 210 steadily rising candles (an uptrend with no swing points). */
const uptrendBase: Row[] = Array.from({ length: 210 }, (_, i) => [1006 + i, 1000 + i, 1004 + i])

/** Swing low 1190, impulse to a swing high of 1300, then a pullback reaching the 0.5 level (1245). */
const legAndPullback: Row[] = [
  [1214, 1200],
  [1212, 1195],
  [1208, 1190],
  [1210, 1196],
  [1222, 1205],
  [1236, 1215],
  [1250, 1230],
  [1266, 1245],
  [1282, 1260],
  [1300, 1275, 1295],
  [1295, 1280, 1282],
  [1283, 1265, 1268],
  [1270, 1250, 1252],
  [1255, 1240, 1242],
]

/** Hammer: low 1220 inside the zone, close 1236 above 0.618 (1232), 3 × volume. */
const hammer: Row = [1246, 1220, 1236, 30]

describe('Fibonacci leg and levels', () => {
  it('measures the latest swing low → swing high and its retracement levels', () => {
    const a = analyzeFibonacci(build([...uptrendBase, ...legAndPullback]), 1242, null)
    expect(a.leg?.from.price).toBe(1190)
    expect(a.leg?.to.price).toBe(1300)
    const at = (r: number) => a.leg!.levels.find((l) => l.ratio === r)!.price
    expect(at(0.5)).toBe(1245)
    expect(at(0.618)).toBeCloseTo(1232.02, 2)
    expect(at(0.786)).toBeCloseTo(1213.54, 2)
    expect(at(1.618)).toBeCloseTo(1367.98, 2)
    expect(a.leg!.depth).toBeCloseTo(60 / 110, 6)
  })

  it('waits while the move is still extending (no confirmed swing high)', () => {
    const a = analyzeFibonacci(build([...uptrendBase, ...legAndPullback.slice(0, 10)]), 1295, null)
    expect(a.setup.status).toBe('waiting')
    expect(a.setup.reasons.join(' ')).toMatch(/No confirmed swing point/)
  })
})

describe('Fibonacci setups', () => {
  it('a confirmed pullback in an uptrend is a valid buy with entry, stop and targets', () => {
    const s = analyzeFibonacci(build([...uptrendBase, ...legAndPullback, hammer]), 1236, null).setup
    expect(s.status).toBe('valid')
    expect(s.direction).toBe('bullish')
    expect(s.entry!.to).toBe(1236)
    expect(s.entry!.from).toBe(1220)
    expect(s.stopLoss!).toBeLessThan(1202.54) // below the 0.886 level
    expect(s.stopLoss!).toBeGreaterThan(1190) // but not below the swing low
    expect(s.targets.map((t) => t.price.toFixed(2))).toEqual(['1300.00', '1329.92', '1367.98'])
    expect(s.rewardRisk!).toBeGreaterThanOrEqual(1.5)
    expect(s.conditions.find((c) => c.id === 'rejection')!.met).toBe(true)
    expect(s.conditions.find((c) => c.id === 'volume')!.met).toBe(true)
  })

  it('only touching the zone is not a trade', () => {
    // Plain candle in the zone: no rejection shape, normal volume, no liquidity level.
    const s = analyzeFibonacci(build([...uptrendBase, ...legAndPullback, [1244, 1230, 1238]]), 1238, null).setup
    expect(s.status).toBe('waiting')
    expect(s.entry).toBeNull()
    expect(s.title).toMatch(/confirmations/)
  })

  it('waits above the zone and shows where it is', () => {
    const s = analyzeFibonacci(build([...uptrendBase, ...legAndPullback.slice(0, 13)]), 1252, null).setup
    expect(s.status).toBe('waiting')
    expect(s.reasons.join(' ')).toMatch(/Buy zone \(50%–78\.6% pullback\): \$1213\.54 – \$1245\.00/)
  })

  it('a close below the 0.886 level cancels the leg', () => {
    const s = analyzeFibonacci(build([...uptrendBase, ...legAndPullback, [1240, 1195, 1198]]), 1198, null).setup
    expect(s.status).toBe('no-trade')
    expect(s.title).toMatch(/too deep/)
  })

  it('never buys in a downtrend, and shows the relief-rally zone instead', () => {
    // Mirror image: a long decline, a down-move from 1300 to 1190, then a bounce.
    const down: Row[] = [...uptrendBase, ...legAndPullback, hammer].map(([h, l, c, v]) => [2600 - l, 2600 - h, c !== undefined ? 2600 - c : undefined, v])
    const a = analyzeFibonacci(build(down), 2600 - 1236, null)
    expect(a.setup.status).not.toBe('valid')
    expect(a.setup.conditions.find((c) => c.id === 'trend')?.met).toBe(false)
    expect(a.reliefZone).not.toBeNull()
  })

  it('reports an unknown trend when there are too few candles for the 200 EMA', () => {
    // Same swing, 170 lower, so it continues a 40-candle base without a gap.
    const shift = (r: Row): Row => [r[0] - 170, r[1] - 170, r[2] !== undefined ? r[2] - 170 : undefined, r[3]]
    const s = analyzeFibonacci(build([...uptrendBase.slice(0, 40), ...legAndPullback.map(shift), shift(hammer)]), 1066, null).setup
    expect(s.status).toBe('no-trade')
    expect(s.title).toMatch(/Not enough history/)
    expect(s.conditions.find((c) => c.id === 'trend')?.met).toBeNull()
  })
})

describe('Fibonacci entry timing', () => {
  it('waits for a pullback when price has already left the entry zone', () => {
    const s = analyzeFibonacci(build([...uptrendBase, ...legAndPullback, hammer]), 1262, null).setup
    expect(s.status).toBe('waiting')
    expect(s.title).toMatch(/wait for a pullback to \$1236\.00/)
  })
})

describe('labels', () => {
  it('shows levels as percentages', async () => {
    const { fibLabel } = await import('@/features/analyzer/fibonacci')
    expect([0, 0.236, 0.5, 0.618, 0.786, 1, 1.618].map(fibLabel)).toEqual(['Fib 0% (high)', 'Fib 23.6%', 'Fib 50%', 'Fib 61.8%', 'Fib 78.6%', 'Fib 100% (low)', 'Fib 161.8%'])
  })
})
