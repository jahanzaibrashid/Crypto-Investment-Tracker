/**
 * Market structure from closed candles. Pure, deterministic, no I/O.
 *
 * Swing points   fractal pivots from findPivots (higher/lower than the N candles on each side),
 *                confirmed only once the N candles after them have closed. N is the sensitivity:
 *                larger N = fewer, bigger swings. Consecutive pivots of the same type are merged
 *                (the more extreme one is kept) so highs and lows alternate.
 * Provisional    the most extreme candle of the last N that beats the N before it but doesn't yet
 *                have N closed candles after it. It can still change or disappear: shown with "?".
 * Labels         HH / LH: a swing high above / not above the previous swing high.
 *                HL / LL: a swing low above / not above the previous swing low.
 * Trend          last confirmed high and low: HH + HL = uptrend, LH + LL = downtrend, else sideways.
 *                EMA 20 / 50 is a separate confirmation (it never changes the structure trend).
 * Break (BOS)    a candle CLOSES above the latest confirmed swing high (bullish) or below the
 *                latest confirmed swing low (bearish). A wick through the level is not a break.
 *                Each level breaks once. Only swing points confirmed by that candle are used,
 *                so a break is never decided with candles that came later.
 */
import type { Candle } from './binance.service'
import { atrSeries, emaSeries } from './indicators'
import { findPivots } from './liquidity'

export const STRUCTURE = {
  emaFast: 20,
  emaSlow: 50,
  atrPeriod: 14,
  /** Closes used for the regression slope. */
  regressionCandles: 50,
  /** A break within this many closed candles counts as "just happened" (alert). */
  recentBreakCandles: 3,
  /** Least closed candles needed for an analysis. */
  minCandles: 60,
}

/** Sensitivity choices: candles on each side of a swing point. */
export const SENSITIVITIES = [2, 3, 5, 8, 10] as const

export type SwingType = 'high' | 'low'
export type SwingLabel = 'HH' | 'HL' | 'LH' | 'LL'
export type Trend = 'up' | 'down' | 'sideways'
export type EmaBias = 'bullish' | 'bearish' | 'mixed'

export interface SwingPoint {
  index: number
  time: number
  price: number
  type: SwingType
  /** Null for the first swing of its type (nothing to compare with). */
  label: SwingLabel | null
  /** False = provisional: may still move or disappear as new candles close. */
  confirmed: boolean
}

export interface StructureBreak {
  /** Candle whose close broke the level. */
  index: number
  time: number
  bias: 'bullish' | 'bearish'
  level: number
  close: number
}

/** A drop from a swing high to the next swing low, and how much of it the next high won back. */
export interface Decline {
  fromTime: number
  toTime: number
  from: number
  to: number
  amount: number
  pct: number
  /** Next swing high's bounce as % of the decline; null until that high exists. */
  retracementPct: number | null
}

export interface StructureMetrics {
  declines: Decline[]
  avgDecline: { amount: number; pct: number } | null
  avgRetracementPct: number | null
  /** Change from each confirmed swing low to the next (negative = lower low). */
  lowDiffs: { time: number; price: number; diff: number }[]
  avgLowDiff: number | null
  /** Linear regression of the last closes. */
  slope: { perCandle: number; perDay: number; pctPerDay: number; r2: number; candles: number } | null
  atr: { value: number; pct: number } | null
  /** Projection from past swings. An estimate, never a target. */
  estimatedLow: { price: number; method: string } | null
}

export interface StructureAnalysis {
  strength: number
  swings: SwingPoint[]
  trend: Trend
  trendReason: string
  ema: { fast: number | null; slow: number | null; bias: EmaBias }
  /** EMA agrees with the structure trend (null for sideways). */
  emaConfirms: boolean | null
  latestHigh: SwingPoint | null
  latestLow: SwingPoint | null
  /** Unbroken levels a close must cross for the next break. */
  bosLevels: { high: number | null; low: number | null }
  breaks: StructureBreak[]
  /** Latest break if it happened within the last few closed candles. */
  recentBreak: StructureBreak | null
  metrics: StructureMetrics
}

interface Pivot {
  index: number
  price: number
}

const DAY_MS = 86_400_000

/**
 * Breaks of structure, decided candle by candle with only the swing points confirmed by then.
 * Also returns the levels still unbroken after the last candle (the next break triggers).
 */
function scanBreaks(candles: Candle[], strength: number) {
  const { highs, lows } = findPivots(candles, strength)
  const breaks: StructureBreak[] = []
  let hi = 0
  let lo = 0
  let high: { price: number; broken: boolean } | null = null
  let low: { price: number; broken: boolean } | null = null
  for (let t = 0; t < candles.length; t++) {
    // A pivot is known once the `strength` candles after it have closed.
    while (hi < highs.length && highs[hi]!.index + strength <= t) high = { price: highs[hi++]!.price, broken: false }
    while (lo < lows.length && lows[lo]!.index + strength <= t) low = { price: lows[lo++]!.price, broken: false }
    const c = candles[t]!
    if (high && !high.broken && c.close > high.price) {
      high.broken = true
      breaks.push({ index: t, time: c.openTime, bias: 'bullish', level: high.price, close: c.close })
    }
    if (low && !low.broken && c.close < low.price) {
      low.broken = true
      breaks.push({ index: t, time: c.openTime, bias: 'bearish', level: low.price, close: c.close })
    }
  }
  return { breaks, open: { high: high && !high.broken ? high.price : null, low: low && !low.broken ? low.price : null } }
}

/** Breaks of structure (used by the live analysis and the backtest alike). */
export function findBreaks(candles: Candle[], strength: number): StructureBreak[] {
  return scanBreaks(candles, strength).breaks
}

/** The newest candle that would be a pivot if the next candles don't beat it. */
function provisional(candles: Candle[], strength: number, type: SwingType): Pivot | null {
  const n = candles.length
  let best: Pivot | null = null
  for (let i = Math.max(strength, n - strength); i < n; i++) {
    const v = type === 'high' ? candles[i]!.high : candles[i]!.low
    let ok = true
    for (let k = 1; k <= strength && ok; k++) {
      const w = type === 'high' ? candles[i - k]!.high : candles[i - k]!.low
      if (type === 'high' ? !(v > w) : !(v < w)) ok = false
    }
    for (let k = i + 1; k < n && ok; k++) {
      const w = type === 'high' ? candles[k]!.high : candles[k]!.low
      if (type === 'high' ? w > v : w < v) ok = false
    }
    if (ok && (!best || (type === 'high' ? v > best.price : v < best.price))) best = { index: i, price: v }
  }
  return best
}

/** Merge same-type neighbours (keep the more extreme) so highs and lows alternate. */
function alternate(points: SwingPoint[]): SwingPoint[] {
  const out: SwingPoint[] = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (prev && prev.type === p.type) {
      if (p.type === 'high' ? p.price > prev.price : p.price < prev.price) out[out.length - 1] = p
    } else out.push(p)
  }
  return out
}

function label(points: SwingPoint[]): SwingPoint[] {
  let lastHigh: number | null = null
  let lastLow: number | null = null
  return points.map((p) => {
    let l: SwingLabel | null = null
    if (p.type === 'high') {
      if (lastHigh !== null) l = p.price > lastHigh ? 'HH' : 'LH'
      lastHigh = p.price
    } else {
      if (lastLow !== null) l = p.price < lastLow ? 'LL' : 'HL'
      lastLow = p.price
    }
    return { ...p, label: l }
  })
}

export function detectSwings(candles: Candle[], strength: number): SwingPoint[] {
  const { highs, lows } = findPivots(candles, strength)
  const point = (p: Pivot, type: SwingType, confirmed: boolean): SwingPoint => ({ index: p.index, time: candles[p.index]!.openTime, price: p.price, type, label: null, confirmed })
  // Same candle as both: an up candle made its low first, a down candle its high first.
  const order = (p: SwingPoint) => p.index + (candles[p.index]!.close >= candles[p.index]!.open ? (p.type === 'low' ? 0 : 0.5) : p.type === 'high' ? 0 : 0.5)
  const merged = [...highs.map((p) => point(p, 'high', true)), ...lows.map((p) => point(p, 'low', true))].sort((a, b) => order(a) - order(b))
  const confirmed = alternate(merged)
  const lastConfirmed = confirmed[confirmed.length - 1]?.index ?? -1
  const pending = (['high', 'low'] as const)
    .map((t) => {
      const p = provisional(candles, strength, t)
      return p && p.index > lastConfirmed ? point(p, t, false) : null
    })
    .filter((p): p is SwingPoint => p !== null)
    .sort((a, b) => order(a) - order(b))
  return label(alternate([...confirmed, ...pending]))
}

function regression(values: number[]) {
  const n = values.length
  const mx = (n - 1) / 2
  const my = values.reduce((s, v) => s + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - mx) * (values[i]! - my)
    sxx += (i - mx) ** 2
    syy += (values[i]! - my) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  return { slope, mean: my, r2: sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)

function metrics(candles: Candle[], swings: SwingPoint[], trend: Trend, intervalMs: number): StructureMetrics {
  const confirmed = swings.filter((s) => s.confirmed)
  const declines: Decline[] = []
  for (let i = 0; i + 1 < confirmed.length; i++) {
    const a = confirmed[i]!
    const b = confirmed[i + 1]!
    if (a.type !== 'high' || b.type !== 'low') continue
    const amount = a.price - b.price
    const next = confirmed[i + 2]
    declines.push({
      fromTime: a.time,
      toTime: b.time,
      from: a.price,
      to: b.price,
      amount,
      pct: (amount / a.price) * 100,
      retracementPct: next?.type === 'high' && amount > 0 ? ((next.price - b.price) / amount) * 100 : null,
    })
  }
  const lows = confirmed.filter((s) => s.type === 'low')
  const lowDiffs = lows.slice(1).map((l, i) => ({ time: l.time, price: l.price, diff: l.price - lows[i]!.price }))
  const avgAmount = avg(declines.map((d) => d.amount))
  const avgPct = avg(declines.map((d) => d.pct))
  const avgLowDiff = avg(lowDiffs.map((d) => d.diff))

  const closes = candles.slice(-STRUCTURE.regressionCandles).map((c) => c.close)
  let slope: StructureMetrics['slope'] = null
  if (closes.length >= 10) {
    const r = regression(closes)
    const perDay = r.slope * (DAY_MS / intervalMs)
    slope = { perCandle: r.slope, perDay, pctPerDay: (perDay / r.mean) * 100, r2: r.r2, candles: closes.length }
  }
  const atrValue = atrSeries(candles, STRUCTURE.atrPeriod).at(-1) ?? null
  const lastClose = candles[candles.length - 1]?.close ?? 0
  const atr = atrValue !== null && lastClose > 0 ? { value: atrValue, pct: (atrValue / lastClose) * 100 } : null

  let estimatedLow: StructureMetrics['estimatedLow'] = null
  const last = confirmed[confirmed.length - 1]
  if (last?.type === 'high' && avgAmount !== null && declines.length >= 2) {
    estimatedLow = { price: last.price - avgAmount, method: `latest swing high minus the average decline of the last ${declines.length} drops` }
  } else if (last?.type === 'low' && trend === 'down' && avgLowDiff !== null && avgLowDiff < 0) {
    estimatedLow = { price: last.price + avgLowDiff, method: `latest swing low plus the average change between the last ${lowDiffs.length + 1} swing lows` }
  }

  return {
    declines,
    avgDecline: avgAmount !== null && avgPct !== null ? { amount: avgAmount, pct: avgPct } : null,
    avgRetracementPct: avg(declines.flatMap((d) => (d.retracementPct === null ? [] : [d.retracementPct]))),
    lowDiffs,
    avgLowDiff,
    slope,
    atr,
    estimatedLow,
  }
}

export function analyzeStructure(closed: Candle[], strength: number, intervalMs: number): StructureAnalysis | null {
  if (closed.length < Math.max(STRUCTURE.minCandles, strength * 2 + 1)) return null
  const swings = detectSwings(closed, strength)
  const confirmed = swings.filter((s) => s.confirmed)
  const latestHigh = confirmed.filter((s) => s.type === 'high').at(-1) ?? null
  const latestLow = confirmed.filter((s) => s.type === 'low').at(-1) ?? null

  let trend: Trend = 'sideways'
  let trendReason = 'Not enough confirmed swing points yet.'
  if (latestHigh?.label && latestLow?.label) {
    if (latestHigh.label === 'HH' && latestLow.label === 'HL') {
      trend = 'up'
      trendReason = 'Higher high and higher low: buyers are in control.'
    } else if (latestHigh.label === 'LH' && latestLow.label === 'LL') {
      trend = 'down'
      trendReason = 'Lower high and lower low: sellers are in control.'
    } else {
      trendReason = `Mixed structure (${latestHigh.label} and ${latestLow.label}): no clear trend.`
    }
  }

  const closes = closed.map((c) => c.close)
  const fast = emaSeries(closes, STRUCTURE.emaFast).at(-1) ?? null
  const slow = emaSeries(closes, STRUCTURE.emaSlow).at(-1) ?? null
  const close = closes[closes.length - 1]!
  const bias: EmaBias = fast === null || slow === null ? 'mixed' : fast > slow && close > slow ? 'bullish' : fast < slow && close < slow ? 'bearish' : 'mixed'
  const emaConfirms = trend === 'sideways' ? null : (trend === 'up' && bias === 'bullish') || (trend === 'down' && bias === 'bearish')

  const { breaks, open } = scanBreaks(closed, strength)
  const lastBreak = breaks[breaks.length - 1] ?? null
  return {
    strength,
    swings,
    trend,
    trendReason,
    ema: { fast, slow, bias },
    emaConfirms,
    latestHigh,
    latestLow,
    bosLevels: open,
    breaks,
    recentBreak: lastBreak && lastBreak.index >= closed.length - STRUCTURE.recentBreakCandles ? lastBreak : null,
    metrics: metrics(closed, swings, trend, intervalMs),
  }
}
