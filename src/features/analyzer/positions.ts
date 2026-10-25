/**
 * Exit monitor for open spot positions (pure, no I/O). For each open ETH lot from the Investments
 * page it says Hold / Take profit / Exit, from the same chart the analyzer uses (closed candles).
 *
 *   Exit         the last closed candle is below the latest confirmed swing low (the uptrend's
 *                structure broke), or below the 200-candle EMA (the trend turned down)
 *   Take profit  a sell-zone liquidity level was swept and closed back below (recent, still valid),
 *                or price reached the Fibonacci 161.8% extension of the current up-move
 *   Hold         none of the above; shows the exit level and the next sell-zone target
 * Exit beats take profit, which beats hold. Informational: nothing is sold automatically.
 */
import type { Candle } from './binance.service'
import type { FibLeg } from './fibonacci'
import { emaSeries } from './indicators'
import { findPivots, levelLabel, type LiquidityAnalysis, type LiquidityLevel } from './liquidity'

export type PositionAction = 'hold' | 'take-profit' | 'exit'

export interface OpenLot {
  id: string
  buyDate: string
  quantity: number
  /** Remaining cost basis ÷ remaining quantity (buy fee included). */
  costPerCoin: number
}

export interface MarketSignals {
  action: PositionAction
  reasons: string[]
  /** Exit if a candle closes below this (latest confirmed swing low). */
  exitLevel: number | null
  ema200: number | null
  /** Next sell-zone level above the price. */
  nextTarget: LiquidityLevel | null
}

export interface PositionView {
  lot: OpenLot
  action: PositionAction
  /** Profit/loss now, USD and percent of cost. */
  pnl: number
  pnlPct: number
  /** Profit/loss if sold at the exit level / next target. */
  pnlAtExit: number | null
  pnlAtTarget: number | null
}

const usd = (n: number) => `$${n.toFixed(2)}`

/** Chart-level signals, shared by every open lot. */
export function marketSignals(closed: Candle[], price: number, liquidity: LiquidityAnalysis | null, leg: FibLeg | null, pivotStrength: number): MarketSignals {
  const last = closed[closed.length - 1]
  const ema = emaSeries(
    closed.map((c) => c.close),
    200,
  )
  const ema200 = ema[ema.length - 1] ?? null
  const { lows } = findPivots(closed, pivotStrength)
  const swingLow = lows[lows.length - 1] ?? null
  const nextTarget = liquidity?.above[0] ?? null

  const exitReasons: string[] = []
  if (last && swingLow && last.close < swingLow.price) {
    exitReasons.push(`The last candle closed at ${usd(last.close)}, below the latest swing low ${usd(swingLow.price)}: the uptrend structure broke.`)
  }
  if (last && ema200 !== null && last.close < ema200) {
    exitReasons.push(`The last candle closed below the 200-candle average (${usd(ema200)}): the trend on this chart is down.`)
  }
  if (exitReasons.length) return { action: 'exit', reasons: exitReasons, exitLevel: swingLow?.price ?? null, ema200, nextTarget }

  const tpReasons: string[] = []
  const sweep = liquidity?.events.find((e) => e.bias === 'bearish' && e.type !== 'broken' && !e.invalidated)
  if (sweep) {
    tpReasons.push(`The sell-zone level ${levelLabel(sweep.level)} ${usd(sweep.level.price)} was swept and price closed back below it: a common place for a swing to top out.`)
  }
  const ext = leg?.levels.find((l) => l.ratio === 1.618)
  if (leg && ext) {
    let high = -Infinity
    for (let k = leg.to.index; k < closed.length; k++) high = Math.max(high, closed[k]!.high)
    if (Math.max(high, price) >= ext.price) tpReasons.push(`Price reached the Fibonacci 161.8% extension (${usd(ext.price)}) of the current up-move.`)
  }
  if (tpReasons.length) return { action: 'take-profit', reasons: tpReasons, exitLevel: swingLow?.price ?? null, ema200, nextTarget }

  const hold: string[] = ['The uptrend structure is intact.']
  if (swingLow) hold.push(`Exit if a candle closes below the latest swing low ${usd(swingLow.price)}.`)
  if (nextTarget) hold.push(`Next sell-zone level: ${levelLabel(nextTarget)} ${usd(nextTarget.price)} (consider taking profit there).`)
  return { action: 'hold', reasons: hold, exitLevel: swingLow?.price ?? null, ema200, nextTarget }
}

export function positionView(lot: OpenLot, signals: MarketSignals, price: number): PositionView {
  const at = (p: number) => (p - lot.costPerCoin) * lot.quantity
  return {
    lot,
    action: signals.action,
    pnl: at(price),
    pnlPct: ((price - lot.costPerCoin) / lot.costPerCoin) * 100,
    pnlAtExit: signals.exitLevel !== null ? at(signals.exitLevel) : null,
    pnlAtTarget: signals.nextTarget ? at(signals.nextTarget.price) : null,
  }
}
