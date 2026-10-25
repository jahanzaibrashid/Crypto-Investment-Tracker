/**
 * The common output of every strategy (Liquidity, Fibonacci, Session, Combined), so setups can be
 * compared, combined, backtested and stored the same way. Spot only: a tradeable setup is always
 * bullish (buy); bearish analysis is informational ("avoid buying / consider taking profit").
 */
export type StrategyId = 'liquidity' | 'fibonacci' | 'session' | 'combined'

/** valid = all rules met; waiting = not there yet (shows where to look); no-trade = rules failed. */
export type SetupStatus = 'valid' | 'waiting' | 'no-trade'

export interface Condition {
  id: string
  label: string
  /** null = not enough data to decide. */
  met: boolean | null
  detail: string
  /** A required condition must be met; optional ones count toward the confirmation minimum. */
  required: boolean
}

export interface Target {
  label: string
  price: number
}

export interface TradeSetup {
  strategy: StrategyId
  direction: 'bullish' | 'bearish' | 'none'
  status: SetupStatus
  /** One-line headline. */
  title: string
  /** Open time of the candle the setup is based on. */
  time: number
  entry: { from: number; to: number } | null
  stopLoss: number | null
  /** Price that cancels the idea (may equal the stop-loss). */
  invalidation: number | null
  targets: Target[]
  /** Reward ÷ risk to the first target, from the top of the entry zone (worst fill). */
  rewardRisk: number | null
  /** ATR(14) of the analyzed candles, for distance checks. */
  atr: number | null
  conditions: Condition[]
  reasons: string[]
  invalidations: string[]
}

/** Minimum reward : risk to the first target for a valid setup. */
export const MIN_REWARD_RISK = 1.5

export function rewardRisk(entry: number, stop: number, target: number): number | null {
  const risk = entry - stop
  return risk > 0 ? (target - entry) / risk : null
}

/** How far above the entry zone (× ATR) a setup still counts as "at the entry". */
export const ENTRY_TOLERANCE_ATR = 0.25

/** Where the live price is relative to an entry zone: inside, above (missed for now) or below. */
export function entryPosition(price: number, entry: { from: number; to: number }, atr: number): 'in' | 'above' | 'below' {
  const tol = ENTRY_TOLERANCE_ATR * atr
  if (price > entry.to + tol) return 'above'
  if (price < entry.from - tol) return 'below'
  return 'in'
}
