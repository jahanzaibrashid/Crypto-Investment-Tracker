import { useId, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { D, sum, type Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatPrice, formatQuantity } from '@/lib/formatters'
import { useTickerPrice } from '@/features/analyzer/analyzer.hooks'
import type { LotMetrics } from './investments.utils'

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
 * Loss recovery for the investments shown in the table (the page's filters apply): holdings still
 * held and now below their buy price (unrealized loss at the current market price).
 * Collapsed to its header row until opened.
 *
 *   loss to recover  = Σ (remaining cost − remaining quantity × current price) of those losing buys
 *   profit per trade = loss ÷ trades
 *   ETH per trade    = profit per trade ÷ price interval
 * Trades form a ladder below the ETH price, one interval apart: trade k buys at price − k × interval
 * and sells one interval higher (profit = ETH × interval). The lowest trade sells first, so the loss
 * left shrinks from the bottom up; earlier buys are still held when a lower one fills.
 * Arithmetic only, never advice.
 */
export function LossRecovery({ lots }: { lots: LotMetrics[] }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const ticker = useTickerPrice('ETHUSDT')
  // Shown holdings priced below their buy price right now.
  const losing = lots.filter(
    (l) => l.status === 'HOLDING' && l.remainingQuantity.gt(0) && l.unrealizedPL !== null && l.unrealizedPL.lt(0),
  )
  const unpriced = lots.filter((l) => l.status === 'HOLDING' && l.currentPrice === null).length
  const openLoss = sum(losing.map((l) => l.unrealizedPL!.neg()))
  const [intervalText, setIntervalText] = useState('100')
  const [trades, setTrades] = useState('1')
  const [priceText, setPriceText] = useState('')

  const step = num(intervalText)
  const price = num(priceText) ?? (ticker.data !== undefined ? new D(ticker.data) : null)
  const n = Number(trades)

  let result: ReactNode
  if (losing.length === 0) {
    result = (
      <p className="text-sm text-muted-foreground">
        None of the holdings shown in the table are below their buy price right now.
        {unpriced > 0 && ` (${unpriced} holding${unpriced === 1 ? ' has' : 's have'} no current price, so ${unpriced === 1 ? 'it is' : 'they are'} not checked.)`}
      </p>
    )
  } else if (!step?.gt(0) || !price?.gt(step.times(n))) {
    result = (
      <p className="text-sm text-muted-foreground">
        Enter a price interval and an ETH price above interval × trades{step?.gt(0) ? ` (${usd(step.times(n))})` : ''}, so the lowest buy stays above $0.
      </p>
    )
  } else {
    const loss = openLoss
    const perTrade = loss.dividedBy(n)
    const qty = perTrade.dividedBy(step)
    const rows = Array.from({ length: n }, (_, i) => {
      const buyAt = price.minus(step.times(i + 1))
      return {
        buyAt,
        sellAt: buyAt.plus(step),
        cost: qty.times(buyAt),
        // Lower trades sell first: once this one sells, it and every trade below it are done.
        lossLeft: loss.minus(perTrade.times(n - i)),
        // Trades 1…i+1 are all held when this buy fills; one more drop costs each of them (distance to that price).
        risk: qty.times(step).times(((i + 1) * (i + 2)) / 2),
      }
    })
    const lossLeft = (d: Dec) => (d.lte(0) ? '$0' : `−${formatAmount(d)}`)
    result = (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground">
          Loss to recover: <span className="font-semibold text-destructive-text">−{formatAmount(loss)}</span> (on paper, at today's prices). Buy{' '}
          <span className="font-semibold">{eth(qty)}</span> at each level, {usd(step)} apart going down, and sell each one {usd(step)} higher: profit{' '}
          <span className="font-semibold text-success-text">+{formatAmount(perTrade)}</span> per trade.
        </p>
        {/* Phones: one card per trade; larger screens: the table. */}
        <ul className="tabular flex flex-col gap-2 sm:hidden" aria-label="Recovery trades">
          {rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">Trade {i + 1}</span>
                <span className="text-success-text">+{formatAmount(perTrade)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <Cell label="Buy at">{usd(r.buyAt)}</Cell>
                <Cell label="Sell at">{usd(r.sellAt)}</Cell>
                <Cell label="ETH">
                  <span className="font-semibold">{eth(qty)}</span>
                </Cell>
                <Cell label="Cost">{formatAmount(r.cost)}</Cell>
                <Cell label="Loss left after it sells">{lossLeft(r.lossLeft)}</Cell>
                <Cell label={`If it drops to ${usd(r.buyAt.minus(step))}`}>
                  <span className="text-destructive-text">−{formatAmount(r.risk)}</span>
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
                <th scope="col" className="px-3 py-2 text-right font-medium">Loss left after it sells</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">If it drops {usd(step)} below this buy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium">{i + 1}</td>
                  <td className="px-3 py-2.5 text-right">{usd(r.buyAt)}</td>
                  <td className="px-3 py-2.5 text-right">{usd(r.sellAt)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{eth(qty)}</td>
                  <td className="px-3 py-2.5 text-right">{formatAmount(r.cost)}</td>
                  <td className="px-3 py-2.5 text-right text-success-text">+{formatAmount(perTrade)}</td>
                  <td className="px-3 py-2.5 text-right">{lossLeft(r.lossLeft)}</td>
                  <td className="px-3 py-2.5 text-right text-destructive-text">−{formatAmount(r.risk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          Only a calculator, not advice: ETH may keep falling after you buy. The lowest trade sells first, then the next one up. The last column is the
          paper loss on every trade bought so far if ETH drops another {usd(step)} below that trade's buy price instead of rising. Prices start from the
          ETH price below.
        </p>
      </div>
    )
  }

  return (
    <section aria-label="Loss recovery" className="surface-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-[inherit] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:px-5"
      >
        <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
            Loss recovery calculator
            {/* How far behind: the loss on the shown holdings that are below their buy price today. */}
            {openLoss.gt(0) && <span className="tabular text-destructive-text">{formatAmount(openLoss)} behind</span>}
          </span>
          <span className="text-xs text-muted-foreground">Holdings shown in the table above (your filters apply), priced below their buy price today.</span>
        </span>
      </button>

      {open && (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-border p-4 sm:p-5">
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
        </div>
      )}
    </section>
  )
}
