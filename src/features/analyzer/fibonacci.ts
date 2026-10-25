/**
 * Fibonacci retracement setups from closed candles. Pure, deterministic, no I/O. Spot only:
 * the tradeable setup is a buy on a pullback inside an up-move.
 *
 * Swing leg (bullish)
 *   High  = the latest confirmed swing high (5 candles each side on 4h+, 3 below), not exceeded since,
 *           and higher than the previous swing high (a higher high: the up-move continued the trend).
 *   Low   = the lowest confirmed swing low before it, back to the previous higher swing high.
 *   The leg must be at least 2 × ATR(14) tall.
 *
 * Levels (leg range R = High − Low)
 *   retracement r: High − r × R      r ∈ 0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 0.886
 *   extension e:   Low + e × R       e ∈ 1.272, 1.618
 *   Entry zone = 0.5 … 0.786. A close below 0.886 (or below the Low) cancels the leg.
 *
 * Touching a level is never enough. A setup is valid only when
 *   required  close above EMA 200 (uptrend), price reached the zone, no close below 0.886
 *   2 of 3    a rejection candle in the zone (bullish engulfing or hammer closing above 0.618)
 *             its volume ≥ 1.2 × the 20-candle average
 *             a liquidity level below the price (buy zone) or a bullish sweep inside the Fibonacci zone
 *   and reward : risk to the first target ≥ 1.5.
 *
 * Trade plan
 *   entry     reaction candle close (top) … max(0.786 level, reaction low) (bottom)
 *   stop-loss below min(reaction low, 0.886 level) by 0.1 × ATR, never more than 0.1 × ATR below the Low
 *   targets   the swing High (TP1), 1.272 (TP2), 1.618 (TP3)
 *
 * In a downtrend (close below EMA 200) there is no buy; the bearish leg's 0.5–0.786 zone is shown
 * as a "relief rally" area where holders may consider taking profit.
 */
import type { Candle } from './binance.service'
import { atrSeries, emaSeries, smaSeries } from './indicators'
import { findPivots, type LiquidityAnalysis } from './liquidity'
import { entryPosition, MIN_REWARD_RISK, rewardRisk, type Condition, type TradeSetup } from './setup'

export const FIB = {
  retracements: [0.236, 0.382, 0.5, 0.618, 0.705, 0.786, 0.886],
  extensions: [1.272, 1.618],
  zone: { from: 0.5, to: 0.786 },
  cancel: 0.886,
  minLegAtr: 2,
  volumeFactor: 1.2,
  stopBufferAtr: 0.1,
  /** Optional confirmations needed (of 3). */
  minConfirmations: 2,
  maxLegLookback: 200,
}

export interface FibLevel {
  ratio: number
  price: number
  kind: 'retracement' | 'extension' | 'anchor'
}

export interface FibLeg {
  direction: 'up' | 'down'
  /** Start (Low for an up-leg, High for a down-leg). */
  from: { index: number; time: number; price: number }
  to: { index: number; time: number; price: number }
  levels: FibLevel[]
  /** Deepest retracement since the leg ended, as a ratio of the leg (0 = none, 1 = back to the start). */
  depth: number
}

/**
 * Optional buy-limit order while waiting in an uptrend: placed where the Fibonacci zone and a
 * buy-zone liquidity level overlap (or at 61.8% without one). It fills without waiting for a
 * rejection candle, so it always comes with its stop-loss.
 */
export interface LimitPlan {
  price: number
  reason: string
  stopLoss: number
  target: number
  rewardRisk: number | null
}

export interface FibAnalysis {
  leg: FibLeg | null
  /** Buy-limit suggestion (uptrend, price above the zone or in it without confirmation). */
  limit: LimitPlan | null
  setup: TradeSetup
  /** Downtrend only: the relief-rally zone of the latest down-leg (spot holders: take-profit area). */
  reliefZone: { leg: FibLeg; from: number; to: number } | null
}

/** "61.8%", "50%", "161.8%" */
export function fibPercent(ratio: number): string {
  return `${Number((ratio * 100).toFixed(1))}%`
}

/** Chart / table label: "Fib 61.8%", "Fib 0% (high)", "Fib 100% (low)". */
export function fibLabel(ratio: number): string {
  if (ratio === 0) return 'Fib 0% (high)'
  if (ratio === 1) return 'Fib 100% (low)'
  return `Fib ${fibPercent(ratio)}`
}

const level = (leg: Pick<FibLeg, 'direction' | 'from' | 'to'>, ratio: number) => {
  const range = leg.to.price - leg.from.price
  return leg.to.price - ratio * range
}

function buildLevels(leg: Pick<FibLeg, 'direction' | 'from' | 'to'>): FibLevel[] {
  const range = leg.to.price - leg.from.price
  return [
    { ratio: 0, price: leg.to.price, kind: 'anchor' as const },
    ...FIB.retracements.map((r) => ({ ratio: r, price: level(leg, r), kind: 'retracement' as const })),
    { ratio: 1, price: leg.from.price, kind: 'anchor' as const },
    ...FIB.extensions.map((e) => ({ ratio: e, price: leg.from.price + e * range, kind: 'extension' as const })),
  ]
}

/** Latest confirmed leg in a direction, or a reason why there is none. */
export function findLeg(candles: Candle[], direction: 'up' | 'down', atr: (number | null)[], strength = 3): FibLeg | string {
  const { highs, lows } = findPivots(candles, strength)
  const ends = direction === 'up' ? highs : lows
  const starts = direction === 'up' ? lows : highs
  const end = ends[ends.length - 1]
  if (!end) return 'No confirmed swing point yet.'
  const better = (a: number, b: number) => (direction === 'up' ? a > b : a < b)
  // The leg is still extending if any later candle went beyond its end.
  for (let k = end.index + 1; k < candles.length; k++) {
    if (better(direction === 'up' ? candles[k]!.high : candles[k]!.low, end.price)) return `No confirmed swing point after the latest move yet (it needs ${strength} closed candles after the turn).`
  }
  // Bound the search at the previous end point that was beyond this one.
  const bound = [...ends].reverse().find((p) => p.index < end.index && better(p.price, end.price))?.index ?? Math.max(0, end.index - FIB.maxLegLookback)
  const candidates = starts.filter((p) => p.index > bound && p.index < end.index)
  if (candidates.length === 0) return 'No swing point to measure the move from.'
  const start = candidates.reduce((a, b) => (better(b.price, a.price) ? a : b))
  // Swing trading follows the trend: the move must make a higher high (down-move: a lower low)
  // than the swing point before it.
  const previous = [...ends].reverse().find((p) => p.index < start.index)
  if (previous && !better(end.price, previous.price)) {
    return direction === 'up'
      ? `The latest up-move topped at $${end.price.toFixed(2)}, below the previous swing high $${previous.price.toFixed(2)}: no higher high, so it is not measured.`
      : `The latest down-move bottomed at $${end.price.toFixed(2)}, above the previous swing low $${previous.price.toFixed(2)}: no lower low.`
  }
  const size = Math.abs(end.price - start.price)
  const a = atr[end.index]
  if (a === null || a === undefined || size < FIB.minLegAtr * a) return 'The latest swing is too small to measure (under 2 × ATR).'
  const legBase = {
    direction,
    from: { index: start.index, time: candles[start.index]!.openTime, price: start.price },
    to: { index: end.index, time: candles[end.index]!.openTime, price: end.price },
  }
  let extreme = end.price
  for (let k = end.index + 1; k < candles.length; k++) {
    extreme = direction === 'up' ? Math.min(extreme, candles[k]!.low) : Math.max(extreme, candles[k]!.high)
  }
  return { ...legBase, levels: buildLevels(legBase), depth: Math.abs(end.price - extreme) / size }
}

function isRejection(c: Candle, prev: Candle | undefined): 'engulfing' | 'hammer' | null {
  const body = Math.abs(c.close - c.open)
  const range = c.high - c.low
  if (prev && c.close > c.open && prev.close < prev.open && c.close >= prev.open && c.open <= prev.close) return 'engulfing'
  const lowerWick = Math.min(c.open, c.close) - c.low
  if (range > 0 && lowerWick >= 2 * body && c.close >= c.low + range / 2) return 'hammer'
  return null
}

const usd = (n: number) => `$${n.toFixed(2)}`

export function analyzeFibonacci(closed: Candle[], price: number, liquidity: LiquidityAnalysis | null, pivotStrength = 3): FibAnalysis {
  const atr = atrSeries(closed, 14)
  const ema200 = emaSeries(
    closed.map((c) => c.close),
    200,
  )
  const volAvg = smaSeries(
    closed.map((c) => c.volume),
    20,
  )
  const last = closed[closed.length - 1]
  const lastAtr = atr[atr.length - 1] ?? null
  const lastEma = ema200[ema200.length - 1] ?? null
  const uptrend = last && lastEma !== null ? last.close > lastEma : null

  const base = (over: Partial<TradeSetup>): TradeSetup => ({
    strategy: 'fibonacci',
    direction: 'none',
    status: 'no-trade',
    title: 'No Fibonacci setup',
    time: last?.openTime ?? 0,
    entry: null,
    stopLoss: null,
    invalidation: null,
    targets: [],
    rewardRisk: null,
    conditions: [],
    reasons: [],
    invalidations: [],
    atr: lastAtr,
    ...over,
  })

  const trendCondition: Condition = {
    id: 'trend',
    label: 'Uptrend (close above EMA 200)',
    met: uptrend,
    detail:
      uptrend === null ? 'Not enough candles for a 200-candle average on this timeframe.' : uptrend ? `Close ${usd(last!.close)} is above the 200 EMA ${usd(lastEma!)}.` : `Close ${usd(last!.close)} is below the 200 EMA ${usd(lastEma!)}.`,
    required: true,
  }

  // Downtrend: no buys. Show the relief-rally zone of the latest down-leg.
  let reliefZone: FibAnalysis['reliefZone'] = null
  if (uptrend === false) {
    const down = findLeg(closed, 'down', atr, pivotStrength)
    if (typeof down !== 'string') reliefZone = { leg: down, from: level(down, FIB.zone.from), to: level(down, FIB.zone.to) }
  }

  const leg = findLeg(closed, 'up', atr, pivotStrength)
  if (typeof leg === 'string') {
    return { leg: null, limit: null, reliefZone, setup: base({ status: 'waiting', title: 'No measurable up-move', conditions: [trendCondition], reasons: [leg] }) }
  }

  const lvl = (r: number) => level(leg, r)
  const zoneTop = lvl(FIB.zone.from)
  const zoneBottom = lvl(FIB.zone.to)
  const cancel = lvl(FIB.cancel)
  const after = closed.slice(leg.to.index + 1)
  const closedBelowCancel = after.some((c) => c.close < cancel)
  const entryIdx = closed.findIndex((c, i) => i > leg.to.index && c.low <= zoneTop)
  const reachedZone = entryIdx >= 0

  // Buy-limit: only in an uptrend, while the leg is intact and price is still above the limit.
  let limit: LimitPlan | null = null
  if (uptrend === true && !closedBelowCancel) {
    const atrNow = lastAtr ?? 0
    const lvl618 = lvl(0.618)
    const confluence = (liquidity?.below ?? [])
      .filter((l) => l.price <= zoneTop && l.price >= cancel)
      .sort((a, b) => Math.abs(a.price - lvl618) - Math.abs(b.price - lvl618))[0]
    const limitPrice = confluence ? confluence.price + 0.1 * atrNow : lvl618
    if (limitPrice < price) {
      const stop = Math.max(leg.from.price, cancel) - FIB.stopBufferAtr * atrNow
      limit = {
        price: limitPrice,
        reason: confluence
          ? `Fibonacci zone + buy-zone liquidity at ${usd(confluence.price)} (limit just above it).`
          : 'Fibonacci 61.8% level (no liquidity level inside the zone).',
        stopLoss: stop,
        target: leg.to.price,
        rewardRisk: rewardRisk(limitPrice, stop, leg.to.price),
      }
    }
  }

  const legText = `Up-move ${usd(leg.from.price)} → ${usd(leg.to.price)}; deepest pullback so far ${(leg.depth * 100).toFixed(1)}%.`
  const zoneText = `Buy zone (50%–78.6% pullback): ${usd(zoneBottom)} – ${usd(zoneTop)}.`

  if (closedBelowCancel) {
    return {
      leg,
      limit,
      reliefZone,
      setup: base({
        status: 'no-trade',
        title: 'Pullback too deep: the up-move failed',
        conditions: [trendCondition],
        reasons: [legText, `A candle closed below the 88.6% level (${usd(cancel)}), so this leg no longer supports a buy.`],
      }),
    }
  }

  if (!reachedZone) {
    return {
      leg,
      limit,
      reliefZone,
      setup: base({
        direction: 'bullish',
        status: 'waiting',
        title: uptrend === false ? 'Downtrend: no buy, even at the Fibonacci zone' : 'Waiting for a pullback into the buy zone',
        entry: null,
        conditions: [trendCondition, { id: 'zone', label: 'Price reached the 50%–78.6% zone', met: false, detail: zoneText, required: true }],
        reasons: [legText, zoneText, 'A setup also needs a rejection candle, volume or a liquidity level there; touching the zone alone is not enough.'],
        invalidations: [`A close below ${usd(cancel)} (88.6% pullback) cancels the leg.`],
      }),
    }
  }

  // Reaction: the most recent rejection candle since the zone was reached, with its low inside the zone.
  let reaction: { index: number; kind: 'engulfing' | 'hammer' } | null = null
  for (let k = closed.length - 1; k >= entryIdx; k--) {
    const c = closed[k]!
    const kind = isRejection(c, closed[k - 1])
    if (kind && c.low <= zoneTop && c.low >= cancel && c.close >= lvl(0.618)) {
      reaction = { index: k, kind }
      break
    }
  }
  const rc = reaction ? closed[reaction.index]! : null
  const volOk = rc && volAvg[reaction!.index] ? rc.volume >= FIB.volumeFactor * volAvg[reaction!.index]! : rc ? null : false
  const tol = (lastAtr ?? 0) * 0.25
  const inZone = (p: number) => p <= zoneTop + tol && p >= cancel - tol
  const liqLevel =
    liquidity?.events.find((e) => e.level.side === 'sell' && e.bias === 'bullish' && !e.invalidated && inZone(e.level.price))?.level ??
    liquidity?.below.find((l) => inZone(l.price)) ??
    null

  const confirmations: Condition[] = [
    {
      id: 'rejection',
      label: 'Rejection candle in the zone',
      met: rc !== null,
      detail: rc ? `${reaction!.kind === 'engulfing' ? 'Bullish engulfing' : 'Hammer'} candle closed at ${usd(rc.close)} with its low at ${usd(rc.low)}.` : 'No bullish engulfing or hammer closing above the 61.8% level yet.',
      required: false,
    },
    {
      id: 'volume',
      label: 'Volume on the reaction ≥ 1.2 × average',
      met: volOk,
      detail: rc && volAvg[reaction!.index] ? `${(rc.volume / volAvg[reaction!.index]!).toFixed(2)} × the 20-candle average.` : 'Needs a reaction candle first.',
      required: false,
    },
    {
      id: 'liquidity',
      label: 'Liquidity level in the zone',
      met: liqLevel !== null,
      detail: liqLevel ? `A buy-zone liquidity level at ${usd(liqLevel.price)} sits inside the Fibonacci zone.` : 'No liquidity level inside the zone.',
      required: false,
    },
  ]
  const confirmed = confirmations.filter((c) => c.met === true).length
  const zoneCondition: Condition = { id: 'zone', label: 'Price reached the 50%–78.6% zone', met: true, detail: zoneText, required: true }

  const conditions = [trendCondition, zoneCondition, ...confirmations]
  const invalidations = [`A close below ${usd(cancel)} (88.6% pullback).`, 'A close below the 200 EMA (trend turns down).']

  if (uptrend !== true || confirmed < FIB.minConfirmations || !rc) {
    return {
      leg,
      limit,
      reliefZone,
      setup: base({
        direction: 'bullish',
        status: uptrend === true ? 'waiting' : 'no-trade',
        title:
          uptrend === false
            ? 'Downtrend: no buy at the Fibonacci zone'
            : uptrend === null
              ? 'Not enough history for the trend check on this timeframe'
              : `In the buy zone; ${confirmed} of ${FIB.minConfirmations} confirmations`,
        conditions,
        reasons: [
          legText,
          zoneText,
          uptrend === false
            ? 'Spot buys are only taken in an uptrend.'
            : uptrend === null
              ? 'The trend check needs 200 closed candles; use a shorter timeframe.'
              : 'Waiting for more confirmation before a buy.',
        ],
        invalidations,
      }),
    }
  }

  const entryTop = rc.close
  const entryBottom = Math.max(zoneBottom, rc.low)
  const buffer = (lastAtr ?? 0) * FIB.stopBufferAtr
  const stop = Math.max(leg.from.price - buffer, Math.min(rc.low, cancel) - buffer)
  const targets = [
    { label: 'TP1 swing high', price: leg.to.price },
    { label: 'TP2 127.2%', price: lvl(-0.272) },
    { label: 'TP3 161.8%', price: lvl(-0.618) },
  ]
  const rr = rewardRisk(entryTop, stop, targets[0]!.price)
  const rrCondition: Condition = {
    id: 'rr',
    label: `Reward : risk to TP1 ≥ ${MIN_REWARD_RISK}`,
    met: rr !== null && rr >= MIN_REWARD_RISK,
    detail: rr !== null ? `${rr.toFixed(2)} : 1 from ${usd(entryTop)}.` : 'Entry is at or below the stop.',
    required: true,
  }
  const where = entryPosition(price, { from: entryBottom, to: entryTop }, lastAtr ?? 0)
  const valid = rrCondition.met === true && price > stop && where !== 'above'

  return {
    leg,
    limit: valid ? null : limit,
    reliefZone,
    setup: base({
      direction: 'bullish',
      status: valid ? 'valid' : rrCondition.met && where === 'above' && price < targets[0]!.price ? 'waiting' : 'no-trade',
      title: valid
        ? 'Buy setup: Fibonacci pullback confirmed'
        : price > targets[0]!.price
          ? 'Price already passed the first target'
          : rrCondition.met && where === 'above'
            ? `Setup formed, but price is above the entry zone: wait for a pullback to ${usd(entryTop)}`
          : price <= stop
            ? 'Price is below the stop-loss: setup failed'
            : 'Confirmed, but reward : risk is too low',
      time: rc.openTime,
      entry: { from: entryBottom, to: entryTop },
      stopLoss: stop,
      invalidation: cancel,
      targets,
      rewardRisk: rr,
      conditions: [...conditions, rrCondition],
      reasons: [
        legText,
        `Price pulled back into the buy zone (${usd(zoneBottom)} – ${usd(zoneTop)}) with: ${confirmations
          .filter((c) => c.met)
          .map((c) => c.label.toLowerCase())
          .join('; ')}.`,
        'The uptrend is intact (close above the 200 EMA).',
      ],
      invalidations,
    }),
  }
}
