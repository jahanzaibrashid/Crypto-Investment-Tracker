/**
 * Technical indicators as series aligned with the input (index i uses values 0..i only, so a
 * backtest never sees the future). Warm-up positions are null.
 *
 *   SMA(n)   simple average of the last n values
 *   EMA(n)   exponential average, seeded with the SMA of the first n values, α = 2 / (n + 1)
 *   RSI(n)   Wilder's RSI
 *   ATR(n)   Wilder's average true range; TR = max(high − low, |high − prevClose|, |low − prevClose|)
 */
import type { Candle } from './binance.service'

export type Series = (number | null)[]

export function smaSeries(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  let total = 0
  for (let i = 0; i < values.length; i++) {
    total += values[i]!
    if (i >= period) total -= values[i - period]!
    if (i >= period - 1) out[i] = total / period
  }
  return out
}

export function emaSeries(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let ema = 0
  for (let i = 0; i < period; i++) ema += values[i]!
  ema /= period
  out[period - 1] = ema
  for (let i = period; i < values.length; i++) {
    ema = values[i]! * k + ema * (1 - k)
    out[i] = ema
  }
  return out
}

export function rsiSeries(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const ch = values[i]! - values[i - 1]!
    if (ch > 0) gain += ch
    else loss -= ch
  }
  gain /= period
  loss /= period
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss))
  out[period] = value()
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i]! - values[i - 1]!
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period
    out[i] = value()
  }
  return out
}

export function trueRange(c: Candle, prev: Candle | undefined): number {
  if (!prev) return c.high - c.low
  return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))
}

export function atrSeries(candles: Candle[], period: number): Series {
  const out: Series = new Array(candles.length).fill(null)
  if (candles.length < period) return out
  let atr = 0
  for (let i = 0; i < period; i++) atr += trueRange(candles[i]!, candles[i - 1])
  atr /= period
  out[period - 1] = atr
  for (let i = period; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRange(candles[i]!, candles[i - 1])) / period
    out[i] = atr
  }
  return out
}

export interface IndicatorSet {
  ema50: Series
  ema200: Series
  rsi14: Series
  atr14: Series
  volumeSma20: Series
}

export function computeIndicators(candles: Candle[]): IndicatorSet {
  const closes = candles.map((c) => c.close)
  return {
    ema50: emaSeries(closes, 50),
    ema200: emaSeries(closes, 200),
    rsi14: rsiSeries(closes, 14),
    atr14: atrSeries(candles, 14),
    volumeSma20: smaSeries(
      candles.map((c) => c.volume),
      20,
    ),
  }
}

/** Last non-null value of a series. */
export function last(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i]!
  return null
}
