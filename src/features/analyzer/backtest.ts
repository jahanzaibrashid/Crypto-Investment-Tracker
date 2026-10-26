/**
 * Backtest of three spot entry rules on closed historical candles. Pure, no I/O.
 *
 *   interval   buy one order every time a close is `interval` below the last fill; each buy is
 *              sold when a close is `interval` above its own entry (orders can stack up)
 *   bos        buy one order on a bullish break of structure; sell when a close is `interval`
 *              above the entry, or on a bearish break (one position at a time)
 *   bos-ema    as bos, but only when EMA 20 > EMA 50 and the close is above EMA 50
 *
 * No look-ahead: every decision is made at a candle's close with data up to that candle only
 * (breaks use swing points already confirmed; EMAs are causal) and fills at that close. A fee is
 * charged on every buy and sell. Positions still open at the end are valued at the last close
 * (after the sell fee) and counted in net P/L, but not as trades.
 *
 * Out of sample: the history is split by time (first 70% / last 30%). Each part starts flat; the
 * second part may use swing points and EMAs formed before it (they were known at the time).
 */
import type { Candle } from './binance.service'
import { emaSeries } from './indicators'
import { findBreaks, STRUCTURE } from './structure'

export type StrategyKey = 'interval' | 'bos' | 'bos-ema'

export const STRATEGY_LABEL: Record<StrategyKey, string> = {
  interval: 'Buy every price interval',
  bos: 'Buy after bullish BOS',
  'bos-ema': 'Bullish BOS + EMA 20/50',
}

export const BACKTEST = {
  /** Closed candles fetched for a backtest (3 requests). */
  candles: 3000,
  inSampleFraction: 0.7,
  /** Binance spot taker fee, % per side. */
  defaultFeePct: 0.1,
  /** Fewest candles in a part to report it. */
  minPartCandles: 100,
}

export interface BacktestConfig {
  interval: number
  orderUsd: number
  feePct: number
  strength: number
}

export interface StrategyResult {
  key: StrategyKey
  trades: number
  wins: number
  winRate: number | null
  /** Realized P/L after fees + open positions valued at the last close. */
  netPnl: number
  realizedPnl: number
  openPnl: number
  openOrders: number
  profitFactor: number | null
  /** Largest peak-to-trough fall of realized + open P/L, USD. */
  maxDrawdown: number
  /** Most money tied up in open orders at once. */
  maxExposure: number
  avgReturnPct: number | null
}

export interface BacktestPart {
  from: number
  to: number
  candles: number
  results: StrategyResult[]
}

export interface BacktestReport {
  inSample: BacktestPart | null
  outOfSample: BacktestPart | null
}

interface Order {
  entry: number
  qty: number
}

interface Signals {
  bullBos: boolean[]
  bearBos: boolean[]
  emaOk: boolean[]
}

function signals(candles: Candle[], strength: number): Signals {
  const n = candles.length
  const bullBos = new Array<boolean>(n).fill(false)
  const bearBos = new Array<boolean>(n).fill(false)
  for (const b of findBreaks(candles, strength)) (b.bias === 'bullish' ? bullBos : bearBos)[b.index] = true
  const closes = candles.map((c) => c.close)
  const fast = emaSeries(closes, STRUCTURE.emaFast)
  const slow = emaSeries(closes, STRUCTURE.emaSlow)
  const emaOk = closes.map((c, i) => fast[i] != null && slow[i] != null && fast[i]! > slow[i]! && c > slow[i]!)
  return { bullBos, bearBos, emaOk }
}

function simulate(key: StrategyKey, candles: Candle[], sig: Signals, from: number, to: number, cfg: BacktestConfig): StrategyResult {
  const fee = cfg.feePct / 100
  const open: Order[] = []
  const returns: number[] = []
  let realized = 0
  let grossProfit = 0
  let grossLoss = 0
  let peak = 0
  let maxDrawdown = 0
  let maxExposure = 0
  let ref = candles[from]!.close

  const buy = (price: number) => open.push({ entry: price, qty: (cfg.orderUsd * (1 - fee)) / price })
  const sell = (o: Order, price: number) => {
    const pnl = o.qty * price * (1 - fee) - cfg.orderUsd
    realized += pnl
    if (pnl > 0) grossProfit += pnl
    else grossLoss -= pnl
    returns.push((pnl / cfg.orderUsd) * 100)
  }
  const openValue = (price: number) => open.reduce((s, o) => s + o.qty * price * (1 - fee) - cfg.orderUsd, 0)

  for (let t = from; t < to; t++) {
    const close = candles[t]!.close
    if (key === 'interval') {
      for (let i = open.length - 1; i >= 0; i--) {
        if (close >= open[i]!.entry + cfg.interval) {
          sell(open[i]!, close)
          open.splice(i, 1)
          ref = close
        }
      }
      // One order per interval crossed since the last fill.
      const steps = Math.floor((ref - close) / cfg.interval)
      for (let k = 0; k < steps; k++) buy(close)
      if (steps > 0) ref -= steps * cfg.interval
    } else {
      const pos = open[0]
      if (pos && (close >= pos.entry + cfg.interval || sig.bearBos[t])) {
        sell(pos, close)
        open.length = 0
      } else if (!pos && sig.bullBos[t] && (key === 'bos' || sig.emaOk[t])) {
        buy(close)
      }
    }
    maxExposure = Math.max(maxExposure, open.length * cfg.orderUsd)
    const equity = realized + openValue(close)
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, peak - equity)
  }

  const openPnl = openValue(candles[to - 1]!.close)
  const wins = returns.filter((r) => r > 0).length
  return {
    key,
    trades: returns.length,
    wins,
    winRate: returns.length ? (wins / returns.length) * 100 : null,
    netPnl: realized + openPnl,
    realizedPnl: realized,
    openPnl,
    openOrders: open.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    maxDrawdown,
    maxExposure,
    avgReturnPct: returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : null,
  }
}

const KEYS: StrategyKey[] = ['interval', 'bos', 'bos-ema']

export function runBacktest(closed: Candle[], cfg: BacktestConfig): BacktestReport {
  // Skip the EMA warm-up so the EMA rule is testable from the first candle.
  const start = STRUCTURE.emaSlow
  const split = start + Math.floor((closed.length - start) * BACKTEST.inSampleFraction)
  if (!(cfg.interval > 0) || !(cfg.orderUsd > 0) || closed.length - start < BACKTEST.minPartCandles * 2) return { inSample: null, outOfSample: null }
  const sig = signals(closed, cfg.strength)
  const part = (from: number, to: number): BacktestPart | null =>
    to - from < BACKTEST.minPartCandles
      ? null
      : { from: closed[from]!.openTime, to: closed[to - 1]!.closeTime, candles: to - from, results: KEYS.map((k) => simulate(k, closed, sig, from, to, cfg)) }
  return { inSample: part(start, split), outOfSample: part(split, closed.length) }
}
