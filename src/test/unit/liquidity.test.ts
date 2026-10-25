import { describe, expect, it } from 'vitest'
import type { Candle } from '@/features/analyzer/binance.service'
import { analyzeLiquidity, findPivots, levelLabel, periodKinds } from '@/features/analyzer/liquidity'

const H4 = 4 * 3_600_000
const DAY = 86_400_000
/** Any interval below 4h: swing points need 3 candles each side (4h+ needs 5). */
const PIVOT3 = 3_600_000
const T0 = Date.UTC(2026, 9, 5) // Monday 2026-10-05 00:00 UTC

/** Candles from [high, low, close?] tuples; open = previous close. */
function build(rows: [number, number, number?][], start = T0, step = H4): Candle[] {
  let prevClose = (rows[0]![0] + rows[0]![1]) / 2
  return rows.map(([high, low, close], i) => {
    const c = close ?? (high + low) / 2
    const open = Math.min(Math.max(prevClose, low), high)
    prevClose = c
    return { openTime: start + i * step, closeTime: start + (i + 1) * step - 1, open, high, low, close: c, volume: 10, quoteVolume: 10 * c, trades: 1, takerBuyVolume: 5 }
  })
}

/** Gentle zig-zag filler between `lo` and `hi` that creates no new extremes. */
const filler = (n: number, lo = 100, hi = 104): [number, number][] => Array.from({ length: n }, (_, i) => (i % 2 ? [hi, lo + 1] : [hi - 1, lo]))

describe('swing pivots', () => {
  it('needs 3 lower highs on each side, and is only confirmed after 3 more candles', () => {
    const rows: [number, number][] = [...filler(5), [120, 105], [104, 101], [103, 100], [104, 101]]
    const { highs } = findPivots(build(rows))
    expect(highs.map((h) => h.price)).toEqual([120])
    // With only 2 candles after it, the same high is not a pivot yet (no look-ahead).
    expect(findPivots(build(rows.slice(0, -1))).highs).toEqual([])
  })
})

describe('liquidity levels', () => {
  it('splits open levels into above and below the live price, nearest first', () => {
    const rows: [number, number][] = [...filler(4), [130, 104], ...filler(4), [104, 80], ...filler(4), [115, 104], ...filler(4), [104, 90], ...filler(20)]
    const swings = (levels: { kind: string; price: number }[]) => levels.filter((l) => l.kind === 'swing').map((l) => l.price)
    const a = analyzeLiquidity(build(rows), PIVOT3, 102)
    expect(swings(a.above)).toEqual([115, 130])
    expect(swings(a.below)).toEqual([90, 80])
    expect(a.above.every((l) => l.side === 'buy' && l.price > 102)).toBe(true)
    expect(a.below.every((l) => l.side === 'sell' && l.price < 102)).toBe(true)

    // Price moves up past 115: that level is now being tested, not open liquidity above.
    const higher = analyzeLiquidity(build(rows), PIVOT3, 116)
    expect(swings(higher.above)).toEqual([130])
    expect(swings(higher.testing)).toEqual([115])
  })

  it('groups highs at nearly the same price into one equal-highs level', () => {
    const rows: [number, number][] = [...filler(4), [120, 104], ...filler(4), [120.05, 104], ...filler(4), [119.98, 104], ...filler(20)]
    const a = analyzeLiquidity(build(rows), PIVOT3, 102)
    const eq = a.above.find((l) => l.kind === 'equal')!
    expect(eq.touches).toBe(3)
    expect(eq.price).toBe(120.05)
    expect(eq.strength).toBe('major')
    expect(levelLabel(eq)).toBe('EQH ×3')
  })

  it('a wick beyond a low that closes back inside is a bullish sweep', () => {
    const rows: [number, number, number?][] = [...filler(4), [104, 90], ...filler(20), [103, 88, 101], [104, 100], [104, 101]]
    const a = analyzeLiquidity(build(rows), PIVOT3, 102)
    expect(a.below.find((l) => l.price === 90)).toBeUndefined() // taken, no longer open
    const sweep = a.events.find((e) => e.level.price === 90)!
    expect(sweep.type).toBe('swept')
    expect(sweep.bias).toBe('bullish')
    expect(sweep.extreme).toBe(88)
    expect(a.bullish.status).toBe('triggered')
    expect(a.bullish.invalidation).toBe(88)
  })

  it('a close beyond that is reclaimed within 3 candles is a failed breakout; a held close is a break', () => {
    const failed: [number, number, number?][] = [...filler(4), [120, 104], ...filler(20), [124, 110, 122], [123, 112, 118], [104, 100]]
    const f = analyzeLiquidity(build(failed), PIVOT3, 102).events.find((e) => e.level.price === 120)!
    expect(f.type).toBe('failed-breakout')
    expect(f.bias).toBe('bearish')
    expect(f.extreme).toBe(124)

    const broken: [number, number, number?][] = [...filler(4), [120, 104], ...filler(20), [124, 110, 122], [126, 121, 125], [128, 123, 127], [129, 124, 128]]
    const b = analyzeLiquidity(build(broken), PIVOT3, 128).events.find((e) => e.level.price === 120)!
    expect(b.type).toBe('broken')
    expect(b.bias).toBe('bullish')
  })

  it('a sweep is no longer "triggered" once price closes beyond the sweep extreme', () => {
    const rows: [number, number, number?][] = [...filler(4), [104, 90], ...filler(20), [103, 88, 101], [102, 85, 86], [90, 84, 87]]
    const a = analyzeLiquidity(build(rows), PIVOT3, 87)
    expect(a.events.find((e) => e.level.price === 90)!.invalidated).toBe(true)
    expect(a.bullish.status).not.toBe('triggered')
  })

  it('adds the previous UTC day high and low on intraday charts', () => {
    // Day 1: 6 × 4h candles ranging 95–110; day 2: 3 candles inside 100–104.
    const rows: [number, number][] = [
      [104, 97],
      [110, 101],
      [103, 99],
      [102, 95],
      [104, 100],
      [103, 101],
      [104, 101],
      [103, 100],
      [104, 102],
    ]
    const a = analyzeLiquidity(build(rows), H4, 102)
    const pdh = a.above.find((l) => l.kind === 'prev-day')
    const pdl = a.below.find((l) => l.kind === 'prev-day')
    expect(pdh?.price).toBe(110)
    expect(pdl?.price).toBe(95)
  })

  it('chooses previous-period levels by timeframe', () => {
    expect(periodKinds(H4)).toEqual(['prev-day', 'prev-week'])
    expect(periodKinds(DAY)).toEqual(['prev-week', 'prev-month'])
    expect(periodKinds(3 * DAY)).toEqual(['prev-month'])
    expect(periodKinds(7 * DAY)).toEqual([])
  })
})

describe('events', () => {
  it('reports one event when a candle sweeps several levels at the same price', () => {
    // Two equal lows at 90 plus the previous-day low at 90, swept by one candle.
    const rows: [number, number, number?][] = [...filler(4), [104, 90], ...filler(4), [104, 90], ...filler(2), [103, 88, 101], [104, 100], [104, 101], [103, 101]]
    const a = analyzeLiquidity(build(rows), H4, 102)
    expect(a.events.filter((e) => e.level.price === 90)).toHaveLength(1)
  })
})
