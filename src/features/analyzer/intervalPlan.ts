/**
 * Fixed-interval buying ("buy every $100 down, sell each buy $100 higher") measured against the
 * market structure. Pure, no I/O. Levels are round multiples of the interval (e.g. 3,400 / 3,300 /
 * 3,200 for $100), which is where limit orders would sit.
 *
 * Ladder        what your position becomes if price falls through each buy level, starting from
 *               the ETH you already hold: total ETH, cost, average entry and P/L at that level.
 * Wait for BOS  instead of buying on the way down, buy after a candle closes above the latest
 *               swing high (bullish break). Higher entry, but only after buyers took control.
 * Informational: nothing is bought or sold.
 */
import type { OpenLot } from './positions'

export interface Holding {
  quantity: number
  cost: number
  avgEntry: number
  value: number
  pnl: number
  pnlPct: number
}

export interface LadderRow {
  level: number
  /** ETH bought at this level. */
  bought: number
  totalEth: number
  totalCost: number
  avgEntry: number
  /** Unrealized P/L of the whole position if price is at this level. */
  pnlAtLevel: number
  pnlPct: number
}

export interface SellRow {
  level: number
  /** P/L of the current holding if sold here. */
  pnl: number | null
}

/** New buys only (your existing ETH is the same either way). */
export interface WaitComparison {
  bosLevel: number
  /** Money put in by the full ladder; the BOS buyer spends the same at the BOS level. */
  cost: number
  ladderEth: number
  ladderAvgEntry: number
  /** ETH the same money buys at the BOS level. */
  waitEth: number
  /** Ladder P/L when price climbs back to the BOS level (the BOS buyer is at 0 there). */
  ladderPnlAtBos: number
  /** Ladder P/L if price reaches the estimated low; the BOS buyer holds nothing then. */
  ladderPnlAtEstimate: number | null
}

export interface IntervalPlan {
  interval: number
  orderUsd: number
  holding: Holding | null
  buyLevels: LadderRow[]
  sellLevels: SellRow[]
  wait: WaitComparison | null
}

export const PLAN = {
  defaultInterval: 100,
  defaultOrderUsd: 100,
  /** Buy and sell levels listed. */
  levels: 5,
}

export function holdingFrom(lots: OpenLot[], price: number): Holding | null {
  const quantity = lots.reduce((s, l) => s + l.quantity, 0)
  if (!(quantity > 0)) return null
  const cost = lots.reduce((s, l) => s + l.quantity * l.costPerCoin, 0)
  const value = quantity * price
  return { quantity, cost, avgEntry: cost / quantity, value, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 }
}

export function intervalPlan(opts: { price: number; interval: number; orderUsd: number; lots: OpenLot[]; bosLevel: number | null; estimatedLow: number | null }): IntervalPlan {
  const { price, interval, orderUsd, lots, bosLevel, estimatedLow } = opts
  const holding = holdingFrom(lots, price)
  // First round level strictly below / above the price.
  const firstBuy = Math.ceil(price / interval) * interval - interval
  const firstSell = Math.floor(price / interval) * interval + interval

  let totalEth = holding?.quantity ?? 0
  let totalCost = holding?.cost ?? 0
  const buyLevels: LadderRow[] = []
  for (let k = 0; k < PLAN.levels; k++) {
    const level = firstBuy - k * interval
    if (level <= 0) break
    const bought = orderUsd / level
    totalEth += bought
    totalCost += orderUsd
    const pnlAtLevel = totalEth * level - totalCost
    buyLevels.push({ level, bought, totalEth, totalCost, avgEntry: totalCost / totalEth, pnlAtLevel, pnlPct: (pnlAtLevel / totalCost) * 100 })
  }

  const sellLevels = Array.from({ length: PLAN.levels }, (_, k) => {
    const level = firstSell + k * interval
    return { level, pnl: holding ? holding.quantity * level - holding.cost : null }
  })

  const ladderEth = buyLevels.reduce((s, r) => s + r.bought, 0)
  const cost = buyLevels.length * orderUsd
  const wait =
    bosLevel !== null && ladderEth > 0
      ? {
          bosLevel,
          cost,
          ladderEth,
          ladderAvgEntry: cost / ladderEth,
          waitEth: cost / bosLevel,
          ladderPnlAtBos: ladderEth * bosLevel - cost,
          ladderPnlAtEstimate: estimatedLow !== null ? ladderEth * estimatedLow - cost : null,
        }
      : null

  return { interval, orderUsd, holding, buyLevels, sellLevels, wait }
}
