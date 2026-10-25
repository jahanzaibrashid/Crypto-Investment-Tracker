import { useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { D, sum, type Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatPrice, formatQuantity } from '@/lib/formatters'
import { useTickerPrice } from '@/features/analyzer/analyzer.hooks'
import { usePortfolio } from '@/features/dashboard/portfolio.context'
import type { CycleProgress } from './strategy.utils'

const NUM = /^\d+(\.\d+)?$/
const num = (raw: string): Dec | null => {
  const v = raw.trim().replace(/,/g, '')
  return NUM.test(v) ? new D(v) : null
}
const usd = (d: Dec) => formatPrice(d.toDecimalPlaces(2).toString())
const eth = (d: Dec) => `${formatQuantity(d.toDecimalPlaces(4).toString())} ETH`

const TRADE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1)

/** Label + value in the phone cards. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere text-foreground">{children}</dd>
    </div>
  )
}

/**
 * Loss recovery for one cycle, from its BUYS: coins bought within the cycle's dates that are still
 * held and now below their buy price (unrealized loss at the current market price).
 *
 *   loss to recover  = Σ (remaining cost − remaining quantity × current price) of those losing buys
 *                      (sold trades are shown separately and not mixed in)
 *   profit per trade = loss ÷ trades
 *   ETH per trade    = profit per trade ÷ price interval
 *     (buy after a drop of one interval, sell after a rise of one interval: profit = ETH × interval)
 * Arithmetic only, never advice.
 */
export function CycleRecovery({ progress: p }: { progress: CycleProgress }) {
  const ticker = useTickerPrice('ETHUSDT')
  // Always the cycle's own dates.
  const days = p.days.filter((d) => d.status !== 'upcoming')
  const { lots } = usePortfolio()
  // Buys made in this cycle, still held, priced below their buy price right now.
  const losing = lots.filter(
    (l) =>
      l.status === 'HOLDING' &&
      l.remainingQuantity.gt(0) &&
      l.investment.buyDate >= p.cycle.startDate &&
      l.investment.buyDate <= p.endDate &&
      l.unrealizedPL !== null &&
      l.unrealizedPL.lt(0),
  )
  const unpriced = lots.filter(
    (l) => l.status === 'HOLDING' && l.investment.buyDate >= p.cycle.startDate && l.investment.buyDate <= p.endDate && l.currentPrice === null,
  ).length
  const openLoss = sum(losing.map((l) => l.unrealizedPL!.neg()))
  const [intervalText, setIntervalText] = useState('100')
  const [trades, setTrades] = useState('1')
  const [priceText, setPriceText] = useState('')

  const step = num(intervalText)
  const price = num(priceText) ?? (ticker.data !== undefined ? new D(ticker.data) : null)
  const n = Number(trades)

  // Sold trades in this cycle: shown for information only.
  const sales = days.reduce((k, d) => k + d.trades.length, 0)
  const net = sum(days.map((d) => d.actual!))

  let result: ReactNode
  if (losing.length === 0) {
    result = (
      <p className="text-sm text-muted-foreground">
        None of the coins you bought in this cycle and still hold are below their buy price right now.
        {unpriced > 0 && ` (${unpriced} holding${unpriced === 1 ? ' has' : 's have'} no current price, so ${unpriced === 1 ? 'it is' : 'they are'} not checked.)`}
      </p>
    )
  } else if (!step?.gt(0) || !price?.gt(step)) {
    result = <p className="text-sm text-muted-foreground">Enter a price interval and an ETH price above it.</p>
  } else {
    const loss = openLoss
    const perTrade = loss.dividedBy(n)
    const qty = perTrade.dividedBy(step)
    const buyAt = price.minus(step)
    const cost = qty.times(buyAt)
    result = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">
          Loss to recover: <span className="font-semibold text-destructive-text">−{formatAmount(loss)}</span> (on paper, at today's prices). Each trade: buy <span className="font-semibold">{eth(qty)}</span> after a {usd(step)} drop, sell
          after a {usd(step)} rise, profit <span className="font-semibold text-success-text">+{formatAmount(perTrade)}</span>.
        </p>
        {/* Phones: one card per trade; larger screens: the table. */}
        <ul className="tabular flex flex-col gap-2 sm:hidden" aria-label="Recovery trades">
          {Array.from({ length: n }, (_, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">Trade {i + 1}</span>
                <span className="text-success-text">+{formatAmount(perTrade)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Cell label="Buy at">{usd(buyAt)}</Cell>
                <Cell label="Sell at">{usd(price)}</Cell>
                <Cell label="ETH">
                  <span className="font-semibold">{eth(qty)}</span>
                </Cell>
                <Cell label="Cost">{formatAmount(cost)}</Cell>
                <Cell label="Loss left">{i + 1 === n ? '$0' : `−${formatAmount(loss.minus(perTrade.times(i + 1)))}`}</Cell>
                <Cell label={`If it drops ${usd(step)} more`}>
                  <span className="text-destructive-text">−{formatAmount(qty.times(step))}</span>
                </Cell>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-background sm:block">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-left font-medium">Trade</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Buy at</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Sell at</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">ETH</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Cost</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Profit</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Loss left</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">If it drops {usd(step)} more instead</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">{i + 1}</td>
                  <td className="px-3 py-2.5 text-right">{usd(buyAt)}</td>
                  <td className="px-3 py-2.5 text-right">{usd(price)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{eth(qty)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(cost)}</td>
                  <td className="px-3 py-2.5 text-right text-success-text">+{formatAmount(perTrade)}</td>
                  <td className="px-3 py-2.5 text-right">{i + 1 === n ? '$0' : `−${formatAmount(loss.minus(perTrade.times(i + 1)))}`}</td>
                  <td className="px-3 py-2.5 text-right text-destructive-text">−{formatAmount(qty.times(step))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Only a calculator, not advice: ETH may keep falling after you buy. The last column is the extra loss if it drops another {usd(step)} instead of
          rising. Buy and sell prices use the ETH price below as the starting point.
        </p>
      </div>
    )
  }

  return (
    <section aria-label="Loss recovery" className="surface-card flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
          Loss recovery
          {/* How far behind: the loss on this cycle's buys that are below their buy price today. */}
          {openLoss.gt(0) && <span className="tabular text-destructive-text">{formatAmount(openLoss)} behind</span>}
        </h3>
        <p className="text-xs text-muted-foreground">
          Coins you bought in this cycle ({formatDate(p.cycle.startDate)} – {formatDate(p.endDate)}) and still hold, priced below their buy price today.
        </p>
      </div>

      {losing.length > 0 && (
        <ul className="tabular flex flex-col gap-2 sm:hidden" aria-label="Coins below their buy price">
          {losing.map((l) => (
            <li key={l.investment.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-semibold text-foreground">{l.investment.symbol}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">{formatDate(l.investment.buyDate)}</span>
                </span>
                <span className="text-destructive-text">−{formatAmount(l.unrealizedPL!.neg())}</span>
              </div>
              <dl className="grid grid-cols-3 gap-x-3">
                <Cell label="Quantity">{formatQuantity(l.remainingQuantity)}</Cell>
                <Cell label="Buy price">{formatPrice(l.buyPrice)}</Cell>
                <Cell label="Price now">{l.currentPrice ? formatPrice(l.currentPrice) : '—'}</Cell>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {losing.length > 0 && (
        <div className="hidden overflow-x-auto rounded-lg border border-border bg-background sm:block">
          <table className="tabular w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2 text-left font-medium">Coin</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Bought</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Quantity</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Buy price</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Price now</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Loss</th>
              </tr>
            </thead>
            <tbody>
              {losing.map((l) => (
                <tr key={l.investment.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{l.investment.symbol}</td>
                  <td className="px-3 py-2">{formatDate(l.investment.buyDate)}</td>
                  <td className="px-3 py-2 text-right">{formatQuantity(l.remainingQuantity)}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(l.buyPrice)}</td>
                  <td className="px-3 py-2 text-right">{l.currentPrice ? formatPrice(l.currentPrice) : '—'}</td>
                  <td className="px-3 py-2 text-right text-destructive-text">−{formatAmount(l.unrealizedPL!.neg())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sales > 0 && (
        <p className="text-xs text-muted-foreground">
          Sold trades in this cycle: <span className={net.lt(0) ? 'text-destructive-text' : 'text-success-text'}>{net.lt(0) ? '−' : '+'}{formatAmount(net.abs())}</span>{' '}
          from {sales} sale{sales === 1 ? '' : 's'} (already realized, not included above).
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Price interval" leading="$" inputMode="decimal" value={intervalText} onChange={(e) => setIntervalText(e.target.value)} hint="Buy after this drop, sell after this rise" />
        <Select label="Number of trades" value={trades} onChange={(e) => setTrades(e.target.value)} options={TRADE_OPTIONS.map((x) => ({ value: String(x), label: String(x) }))} />
        <Input
          label="ETH price now"
          leading="$"
          inputMode="decimal"
          value={priceText}
          placeholder={ticker.data !== undefined ? ticker.data.toFixed(2) : ''}
          onChange={(e) => setPriceText(e.target.value)}
          hint="Empty = live Binance price"
        />
      </div>
      {result}
    </section>
  )
}
