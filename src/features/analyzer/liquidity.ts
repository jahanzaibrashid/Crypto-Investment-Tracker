/**
 * Liquidity analysis from closed candles. Pure, deterministic, no I/O.
 *
 * Idea: obvious highs and lows (swing points, equal highs/lows, the previous day/week/month
 * range) are where many traders place stop-losses and breakout orders, so price often reaches
 * for them. That is a tendency, not knowledge of where orders actually are.
 *
 * Levels
 *   Swing high/low   fractal pivot: higher (lower) than the N candles before it and not exceeded
 *                    by the N after it; confirmed only once those N candles have closed.
 *                    N = 5 on 4h and higher (swing-sized points), 3 below.
 *   Equal highs/lows two or more swing points within 0.15 × ATR(14) of each other.
 *   Previous period  high/low of the previous UTC day (intraday charts), week (≤ 1d charts)
 *                    and month (1d and 3d charts).
 *   Above the price = liquidity at highs; below = liquidity at lows.
 *   Spot wording shown to the user: levels below the price are the buy zone, levels above the sell zone.
 *
 * What happens when price reaches a level (first candle after it formed that trades beyond it)
 *   sweep            wick beyond, close back inside             (bias against the move)
 *   failed breakout  close beyond, then a close back inside within 3 candles
 *   break            close beyond and it holds                  (bias with the move)
 *   A level that was reached is no longer open liquidity.
 */
import type { Candle } from './binance.service'
import { atrSeries } from './indicators'

export const LIQUIDITY = {
  /** Candles each side of a swing point below 4h. */
  pivotStrength: 3,
  /** Candles each side on 4h and higher, so only swing-sized points count. */
  swingPivotStrength: 5,
  equalTolAtr: 0.15,
  failedBreakoutCandles: 3,
  /** Events within this many recent candles are reported. */
  recentCandles: 12,
  atrPeriod: 14,
}

export type Side = 'buy' | 'sell'
export type LevelKind = 'swing' | 'equal' | 'prev-day' | 'prev-week' | 'prev-month'
export type LevelStatus = 'open' | 'swept' | 'failed-breakout' | 'broken'
export type Bias = 'bullish' | 'bearish'

export interface LiquidityLevel {
  id: string
  kind: LevelKind
  /** buy = a high (liquidity above), sell = a low (liquidity below). */
  side: Side
  price: number
  /** Swing points in the level (1 for a single swing; ≥ 2 for equal highs/lows). */
  touches: number
  /** Index of the candle that completed the level (last pivot, or last candle of the period). */
  formedIndex: number
  formedTime: number
  status: LevelStatus
  /** Candle where the level was reached (status ≠ open). */
  takenIndex: number | null
  /** Candle that decided the outcome (the sweep candle, or the candle that closed back inside). */
  resolvedIndex: number | null
  strength: 'major' | 'minor'
}

export interface LiquidityEvent {
  level: LiquidityLevel
  type: Exclude<LevelStatus, 'open'>
  index: number
  time: number
  bias: Bias
  /** Extreme of the move beyond the level (sweep low/high). */
  extreme: number
  /** A later candle closed beyond the extreme, so the event's bias no longer holds. */
  invalidated: boolean
}

export interface Scenario {
  bias: Bias
  /** triggered = a matching sweep/failed breakout just happened; watching = waiting for one. */
  status: 'triggered' | 'watching' | 'none'
  trigger: LiquidityLevel | null
  target: LiquidityLevel | null
  invalidation: number | null
  summary: string
}

export interface LiquidityAnalysis {
  price: number
  atr: number | null
  /** Open levels above the price, nearest first. */
  above: LiquidityLevel[]
  /** Open levels below the price, nearest first. */
  below: LiquidityLevel[]
  /** Levels the forming (unclosed) candle is trading beyond right now. */
  testing: LiquidityLevel[]
  /** Recent sweeps, failed breakouts and breaks, newest first. */
  events: LiquidityEvent[]
  bullish: Scenario
  bearish: Scenario
}

export const KIND_LABEL: Record<LevelKind, string> = {
  swing: 'Swing',
  equal: 'Equal',
  'prev-day': 'Prev day',
  'prev-week': 'Prev week',
  'prev-month': 'Prev month',
}

/** Short chart label, e.g. "EQH ×3", "PDL", "Swing H". */
export function levelLabel(l: LiquidityLevel): string {
  const hl = l.side === 'buy' ? 'H' : 'L'
  switch (l.kind) {
    case 'equal':
      return `EQ${hl} ×${l.touches}`
    case 'prev-day':
      return `PD${hl}`
    case 'prev-week':
      return `PW${hl}`
    case 'prev-month':
      return `PM${hl}`
    default:
      return `Swing ${hl}`
  }
}

/** Why the level may matter (shown to the user). */
export function levelReasons(l: LiquidityLevel, price: number): string[] {
  const where = l.side === 'buy' ? 'above' : 'below'
  const pct = ((Math.abs(l.price - price) / price) * 100).toFixed(2)
  const out: string[] = []
  if (l.kind === 'equal') out.push(`${l.touches} ${l.side === 'buy' ? 'highs' : 'lows'} formed at nearly the same price; stop orders often build up ${where} such obvious levels.`)
  else if (l.kind === 'swing') out.push(`A swing ${l.side === 'buy' ? 'high' : 'low'} that price has not returned to; stops commonly sit just ${where} it.`)
  else out.push(`The ${KIND_LABEL[l.kind].toLowerCase()} ${l.side === 'buy' ? 'high' : 'low'} is widely watched; breakout and stop orders often sit just ${where} it.`)
  out.push(`${pct}% from the current price, untouched since it formed.`)
  return out
}

interface Pivot {
  index: number
  price: number
}

/** Fractal pivots, confirmed only when `strength` candles after them have closed. */
export function findPivots(candles: Candle[], strength = LIQUIDITY.pivotStrength): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = []
  const lows: Pivot[] = []
  for (let i = strength; i < candles.length - strength; i++) {
    const c = candles[i]!
    let isHigh = true
    let isLow = true
    for (let k = 1; k <= strength; k++) {
      if (!(c.high > candles[i - k]!.high) || !(c.high >= candles[i + k]!.high)) isHigh = false
      if (!(c.low < candles[i - k]!.low) || !(c.low <= candles[i + k]!.low)) isLow = false
    }
    if (isHigh) highs.push({ index: i, price: c.high })
    if (isLow) lows.push({ index: i, price: c.low })
  }
  return { highs, lows }
}

/** Beyond the level in the level's direction (above a high / below a low). */
const beyond = (side: Side, value: number, level: number) => (side === 'buy' ? value > level : value < level)

/** How a level was reached after `from` (first candle trading beyond it). */
function resolve(candles: Candle[], side: Side, price: number, from: number) {
  const wick = (c: Candle) => (side === 'buy' ? c.high : c.low)
  for (let k = from; k < candles.length; k++) {
    if (!beyond(side, wick(candles[k]!), price)) continue
    if (!beyond(side, candles[k]!.close, price)) return { status: 'swept' as const, takenIndex: k, resolvedIndex: k }
    for (let j = k + 1; j <= Math.min(k + LIQUIDITY.failedBreakoutCandles, candles.length - 1); j++) {
      if (!beyond(side, candles[j]!.close, price)) return { status: 'failed-breakout' as const, takenIndex: k, resolvedIndex: j }
    }
    return { status: 'broken' as const, takenIndex: k, resolvedIndex: Math.min(k + LIQUIDITY.failedBreakoutCandles, candles.length - 1) }
  }
  return { status: 'open' as const, takenIndex: null, resolvedIndex: null }
}

/** Group pivots at about the same price into levels; a level reached in between starts a new group. */
function clusterPivots(candles: Candle[], pivots: Pivot[], side: Side, atr: (number | null)[]): Omit<LiquidityLevel, 'id' | 'status' | 'takenIndex' | 'resolvedIndex' | 'strength'>[] {
  const groups: { price: number; pivots: Pivot[] }[] = []
  for (const p of pivots) {
    const tol = (atr[p.index] ?? 0) * LIQUIDITY.equalTolAtr
    const g = groups.find((x) => {
      if (Math.abs(x.price - p.price) > tol) return false
      // Not joinable if price traded beyond the group between its last pivot and this one.
      const lastIdx = x.pivots[x.pivots.length - 1]!.index
      for (let k = lastIdx + 1; k < p.index; k++) {
        if (beyond(side, side === 'buy' ? candles[k]!.high : candles[k]!.low, x.price + (side === 'buy' ? tol : -tol))) return false
      }
      return true
    })
    if (g) {
      g.pivots.push(p)
      g.price = side === 'buy' ? Math.max(g.price, p.price) : Math.min(g.price, p.price)
    } else groups.push({ price: p.price, pivots: [p] })
  }
  return groups.map((g) => {
    const lastPivot = g.pivots[g.pivots.length - 1]!
    return {
      kind: g.pivots.length > 1 ? 'equal' : 'swing',
      side,
      price: g.price,
      touches: g.pivots.length,
      formedIndex: lastPivot.index,
      formedTime: candles[lastPivot.index]!.openTime,
    }
  })
}

const DAY = 86_400_000
const WEEK = 7 * DAY
const periodKey = {
  'prev-day': (t: number) => Math.floor(t / DAY),
  // Weeks start Monday 00:00 UTC (the epoch was a Thursday).
  'prev-week': (t: number) => Math.floor((t - 4 * DAY) / WEEK),
  'prev-month': (t: number) => {
    const d = new Date(t)
    return d.getUTCFullYear() * 12 + d.getUTCMonth()
  },
}

/** High and low of the previous complete period, with the index where the current period starts. */
function previousPeriodLevels(candles: Candle[], kind: keyof typeof periodKey): Omit<LiquidityLevel, 'id' | 'status' | 'takenIndex' | 'resolvedIndex' | 'strength'>[] {
  const key = periodKey[kind]
  const last = candles[candles.length - 1]
  if (!last) return []
  const current = key(last.openTime)
  let end = candles.length - 1
  while (end >= 0 && key(candles[end]!.openTime) === current) end--
  if (end < 0) return []
  const prevKey = key(candles[end]!.openTime)
  let start = end
  while (start > 0 && key(candles[start - 1]!.openTime) === prevKey) start--
  let hi = candles[start]!
  let lo = candles[start]!
  for (let k = start; k <= end; k++) {
    if (candles[k]!.high > hi.high) hi = candles[k]!
    if (candles[k]!.low < lo.low) lo = candles[k]!
  }
  return [
    { kind, side: 'buy', price: hi.high, touches: 1, formedIndex: end, formedTime: candles[end]!.openTime },
    { kind, side: 'sell', price: lo.low, touches: 1, formedIndex: end, formedTime: candles[end]!.openTime },
  ]
}

/** Which previous-period levels make sense for a candle size (ms). */
export function periodKinds(intervalMs: number): (keyof typeof periodKey)[] {
  const kinds: (keyof typeof periodKey)[] = []
  if (intervalMs < DAY) kinds.push('prev-day')
  if (intervalMs <= DAY) kinds.push('prev-week')
  if (intervalMs >= DAY && intervalMs <= 3 * DAY) kinds.push('prev-month')
  return kinds
}

const PRIORITY: Record<LevelKind, number> = { 'prev-month': 5, 'prev-week': 4, equal: 3, 'prev-day': 2, swing: 1 }

/**
 * Analyze closed candles. `price` is the live price; `forming` the unclosed candle (if any),
 * used only to report levels being tested right now.
 */
/** Swing-point strength for a candle size: 5 on 4h and higher, 3 below. */
export function pivotStrengthFor(intervalMs: number): number {
  return intervalMs >= 4 * 3_600_000 ? LIQUIDITY.swingPivotStrength : LIQUIDITY.pivotStrength
}

export function analyzeLiquidity(closed: Candle[], intervalMs: number, price: number, forming: Candle | null = null): LiquidityAnalysis {
  const atr = atrSeries(closed, LIQUIDITY.atrPeriod)
  const lastAtr = atr[atr.length - 1] ?? null
  const { highs, lows } = findPivots(closed, pivotStrengthFor(intervalMs))

  const raw = [
    ...clusterPivots(closed, highs, 'buy', atr),
    ...clusterPivots(closed, lows, 'sell', atr),
    ...periodKinds(intervalMs).flatMap((k) => previousPeriodLevels(closed, k)),
  ]

  const levels: LiquidityLevel[] = raw.map((l, i) => {
    const r = resolve(closed, l.side, l.price, l.formedIndex + 1)
    return {
      ...l,
      id: `${l.kind}-${l.side}-${l.formedTime}-${i}`,
      ...r,
      strength: l.kind === 'equal' || l.kind === 'prev-week' || l.kind === 'prev-month' ? 'major' : 'minor',
    }
  })

  // Open levels; ones the forming candle is beyond are "being tested", not open.
  const testing: LiquidityLevel[] = []
  const open: LiquidityLevel[] = []
  for (const l of levels) {
    if (l.status !== 'open') continue
    const now = forming ? (l.side === 'buy' ? Math.max(forming.high, price) : Math.min(forming.low, price)) : price
    if (beyond(l.side, now, l.price)) testing.push(l)
    else open.push(l)
  }

  // Merge open levels on the same side that sit within the tolerance: keep the strongest kind.
  const tol = (lastAtr ?? 0) * LIQUIDITY.equalTolAtr
  const merge = (list: LiquidityLevel[]) => {
    const sorted = [...list].sort((a, b) => a.price - b.price)
    const out: LiquidityLevel[] = []
    for (const l of sorted) {
      const prev = out[out.length - 1]
      if (prev && prev.side === l.side && Math.abs(prev.price - l.price) <= tol) {
        const keep = PRIORITY[l.kind] > PRIORITY[prev.kind] ? l : prev
        out[out.length - 1] = {
          ...keep,
          price: l.side === 'buy' ? Math.max(prev.price, l.price) : Math.min(prev.price, l.price),
          touches: prev.touches + l.touches,
          strength: prev.strength === 'major' || l.strength === 'major' || prev.touches + l.touches > 1 ? 'major' : 'minor',
        }
      } else out.push(l)
    }
    return out
  }
  const merged = merge(open)
  const above = merged.filter((l) => l.price > price).sort((a, b) => a.price - b.price)
  const below = merged.filter((l) => l.price < price).sort((a, b) => b.price - a.price)

  const firstRecent = closed.length - LIQUIDITY.recentCandles
  const events: LiquidityEvent[] = levels
    .filter((l) => l.status !== 'open' && l.resolvedIndex !== null && l.resolvedIndex >= firstRecent)
    .map((l) => {
      const type = l.status as LiquidityEvent['type']
      const sweptLow = l.side === 'sell'
      // Sweeps and failed breakouts point back the other way; a break points with the move.
      const bias: Bias = type === 'broken' ? (sweptLow ? 'bearish' : 'bullish') : sweptLow ? 'bullish' : 'bearish'
      let extreme = sweptLow ? Infinity : -Infinity
      for (let k = l.takenIndex!; k <= l.resolvedIndex!; k++) {
        extreme = sweptLow ? Math.min(extreme, closed[k]!.low) : Math.max(extreme, closed[k]!.high)
      }
      let invalidated = false
      for (let k = l.resolvedIndex! + 1; k < closed.length; k++) {
        if (type !== 'broken' && beyond(l.side, closed[k]!.close, extreme)) invalidated = true
      }
      return { level: l, type, index: l.resolvedIndex!, time: closed[l.resolvedIndex!]!.openTime, bias, extreme, invalidated }
    })
    .sort((a, b) => b.index - a.index || PRIORITY[b.level.kind] - PRIORITY[a.level.kind])
    // The same candle reaching several levels at about one price is one event (keep the strongest level).
    .filter((e, i, list) => !list.slice(0, i).some((p) => p.index === e.index && p.level.side === e.level.side && Math.abs(p.level.price - e.level.price) <= tol))

  const fmt = (n: number) => `$${n.toFixed(2)}`
  const lastBull = events.find((e) => e.bias === 'bullish' && e.type !== 'broken' && !e.invalidated)
  const lastBear = events.find((e) => e.bias === 'bearish' && e.type !== 'broken' && !e.invalidated)
  const nearAbove = above[0] ?? null
  const nearBelow = below[0] ?? null
  const fallbackInvalid = (lvl: number, side: Side) => (lastAtr ? (side === 'sell' ? lvl - lastAtr : lvl + lastAtr) : null)

  const bullish: Scenario = lastBull
    ? {
        bias: 'bullish',
        status: 'triggered',
        trigger: lastBull.level,
        target: nearAbove,
        invalidation: lastBull.extreme,
        summary: `The buy-zone level at ${fmt(lastBull.level.price)} was ${lastBull.type === 'swept' ? 'swept' : 'broken and reclaimed'} and price closed back above it. That often precedes a move up${nearAbove ? ` toward the next sell-zone level at ${fmt(nearAbove.price)}` : ''}. Invalid if price closes below ${fmt(lastBull.extreme)}.`,
      }
    : nearBelow
      ? {
          bias: 'bullish',
          status: 'watching',
          trigger: nearBelow,
          target: nearAbove,
          invalidation: below[1]?.price ?? fallbackInvalid(nearBelow.price, 'sell'),
          summary: `Watch ${fmt(nearBelow.price)} (${levelLabel(nearBelow)}). If price wicks below it and the candle closes back above, that is a bullish sweep${nearAbove ? ` with ${fmt(nearAbove.price)} as the next target` : ''}. A close well below it means the level failed.`,
        }
      : { bias: 'bullish', status: 'none', trigger: null, target: nearAbove, invalidation: null, summary: 'No open buy-zone level below the price in the loaded history.' }

  const bearish: Scenario = lastBear
    ? {
        bias: 'bearish',
        status: 'triggered',
        trigger: lastBear.level,
        target: nearBelow,
        invalidation: lastBear.extreme,
        summary: `The sell-zone level at ${fmt(lastBear.level.price)} was ${lastBear.type === 'swept' ? 'swept' : 'broken and lost'} and price closed back below it. That often precedes a move down${nearBelow ? ` toward ${fmt(nearBelow.price)}` : ''}. On spot: avoid new buys, consider taking profit. Invalid if price closes above ${fmt(lastBear.extreme)}.`,
      }
    : nearAbove
      ? {
          bias: 'bearish',
          status: 'watching',
          trigger: nearAbove,
          target: nearBelow,
          invalidation: above[1]?.price ?? fallbackInvalid(nearAbove.price, 'buy'),
          summary: `Watch ${fmt(nearAbove.price)} (${levelLabel(nearAbove)}). If price wicks above it and closes back below, that is a bearish sweep${nearBelow ? ` with ${fmt(nearBelow.price)} below` : ''}. On spot that means avoiding new buys or taking profit.`,
        }
      : { bias: 'bearish', status: 'none', trigger: null, target: nearBelow, invalidation: null, summary: 'No open sell-zone level above the price in the loaded history.' }

  return { price, atr: lastAtr, above, below, testing, events, bullish, bearish }
}
