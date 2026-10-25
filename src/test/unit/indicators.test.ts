import { describe, expect, it } from 'vitest'
import type { Candle } from '@/features/analyzer/binance.service'
import { atrSeries, computeIndicators, emaSeries, last, rsiSeries, smaSeries, trueRange } from '@/features/analyzer/indicators'

function candle(i: number, o: number, h: number, l: number, c: number, v = 1): Candle {
  return { openTime: i, closeTime: i + 1, open: o, high: h, low: l, close: c, volume: v, quoteVolume: v * c, trades: 1, takerBuyVolume: v / 2 }
}

describe('moving averages', () => {
  it('SMA is null during warm-up, then the rolling mean', () => {
    expect(smaSeries([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('EMA is seeded with the SMA, then smoothed with α = 2 / (n + 1)', () => {
    const ema = emaSeries([1, 2, 3, 4, 5], 3) // α = 0.5
    expect(ema).toEqual([null, null, 2, 3, 4])
    expect(emaSeries([2, 4, 6, 10], 3)[3]).toBe(7) // seed 4, then 10 × 0.5 + 4 × 0.5
  })
})

describe('RSI', () => {
  it('is 100 for only gains, 0 for only losses, 50 when flat', () => {
    expect(last(rsiSeries([1, 2, 3, 4, 5], 3))).toBe(100)
    expect(last(rsiSeries([5, 4, 3, 2, 1], 3))).toBe(0)
    expect(last(rsiSeries([3, 3, 3, 3, 3], 3))).toBe(50)
  })

  it('starts after `period` changes', () => {
    const r = rsiSeries([1, 2, 1, 2, 1], 3)
    expect(r.slice(0, 3)).toEqual([null, null, null])
    expect(r[3]).not.toBeNull()
  })
})

describe('ATR', () => {
  it('uses the true range including gaps from the previous close', () => {
    const prev = candle(0, 100, 105, 95, 100)
    expect(trueRange(candle(1, 110, 112, 108, 111), prev)).toBe(12) // gap up: 112 − 100
    expect(trueRange(candle(1, 99, 101, 90, 95), prev)).toBe(11)
  })

  it('averages the first n true ranges, then Wilder-smooths', () => {
    const candles = [candle(0, 10, 12, 8, 10), candle(1, 10, 14, 10, 12), candle(2, 12, 13, 11, 12), candle(3, 12, 20, 12, 18)]
    const atr = atrSeries(candles, 3)
    expect(atr[2]).toBeCloseTo((4 + 4 + 2) / 3, 10)
    expect(atr[3]).toBeCloseTo(((10 / 3) * 2 + 8) / 3, 10)
  })
})

describe('no look-ahead', () => {
  it('adding future candles never changes earlier indicator values', () => {
    const candles = Array.from({ length: 260 }, (_, i) => {
      const c = 2000 + Math.sin(i / 7) * 80 + i
      return candle(i, c - 5, c + 12, c - 14, c, 100 + (i % 9) * 10)
    })
    const early = computeIndicators(candles.slice(0, 230))
    const full = computeIndicators(candles)
    for (const key of Object.keys(early) as (keyof typeof early)[]) {
      expect(full[key].slice(0, 230)).toEqual(early[key])
    }
  })
})
