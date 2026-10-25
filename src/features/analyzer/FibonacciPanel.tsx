import { Info } from 'lucide-react'
import { InfoTip } from '@/components/ui/InfoTip'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import { FIB, fibPercent, type FibAnalysis } from './fibonacci'
import { SetupCard } from './SetupCard'
import { formatPkt } from './time'

const usd = (n: number) => formatPrice(n.toFixed(2))

export function FibonacciPanel({ analysis: a, price, pair, timeframe }: { analysis: FibAnalysis; price: number; pair: string; timeframe: string }) {
  const leg = a.leg
  return (
    <section aria-labelledby="fib-h" className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <h2 id="fib-h" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Fibonacci
          <InfoTip
            label="Fibonacci"
            text="Measures the latest up-move (swing low → swing high). Pullbacks often pause around 50–78.6% of a move. A buy needs an uptrend plus confirmation in that zone (rejection candle, volume, liquidity); touching a level alone is not a signal. On the chart: orange lines above the current price, blue lines below."
          />
        </h2>
        {leg ? (
          <p className="text-xs text-muted-foreground">
            Up-move from {usd(leg.from.price)} ({formatPkt(leg.from.time)}) to {usd(leg.to.price)} ({formatPkt(leg.to.time)}). Deepest pullback since: {(leg.depth * 100).toFixed(1)}%.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No measurable up-move in the loaded candles.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        {leg && (
          <table className="tabular h-fit w-full overflow-hidden rounded-lg border border-border bg-background text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Level</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Price</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">From price</th>
              </tr>
            </thead>
            <tbody>
              {[...leg.levels]
                .sort((x, y) => y.price - x.price)
                .map((l) => {
                  const inZone = l.kind === 'retracement' && l.ratio >= FIB.zone.from && l.ratio <= FIB.zone.to
                  return (
                    <tr key={l.ratio} className={cn('border-b border-border last:border-0', inZone && 'bg-muted')}>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', l.price > price ? 'bg-warning' : 'bg-primary-solid')}
                          aria-label={l.price > price ? 'Above the price' : 'Below the price'}
                        />
                        {l.ratio === 0 ? 'Swing high (0%)' : l.ratio === 1 ? 'Swing low (100%)' : fibPercent(l.ratio)}
                        {l.kind === 'extension' && <span className="ml-1 text-xs text-muted-foreground">target</span>}
                        {inZone && <span className="ml-1 text-xs text-muted-foreground">buy zone</span>}
                        {l.ratio === FIB.cancel && <span className="ml-1 text-xs text-muted-foreground">cancel</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">{usd(l.price)}</td>
                      <td className="px-3 py-1.5 text-right text-xs text-muted-foreground">
                        {l.price >= price ? '+' : '−'}
                        {((Math.abs(l.price - price) / price) * 100).toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
        <div className="flex min-w-0 flex-col gap-3">
          <SetupCard setup={a.setup} pair={pair} timeframe={timeframe} price={price} />
          {a.limit && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-semibold text-foreground">Buy-limit option: {usd(a.limit.price)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{a.limit.reason}</p>
              <dl className="tabular mt-2 grid grid-cols-1 gap-2 text-xs min-[380px]:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Stop-loss</dt>
                  <dd className="font-medium text-foreground">{usd(a.limit.stopLoss)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Target (swing high)</dt>
                  <dd className="font-medium text-foreground">{usd(a.limit.target)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reward : risk</dt>
                  <dd className="font-medium text-foreground">{a.limit.rewardRisk !== null ? `${a.limit.rewardRisk.toFixed(2)} : 1` : '—'}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                For swing traders who place an order and wait instead of chasing. It fills without waiting for a rejection candle, so set the stop-loss
                with it, and cancel the order if a candle closes below {usd(a.limit.stopLoss)} first.
              </p>
            </div>
          )}
          {a.reliefZone && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
              Downtrend. The latest down-move ran from {usd(a.reliefZone.leg.from.price)} to {usd(a.reliefZone.leg.to.price)}. A bounce into{' '}
              {usd(a.reliefZone.from)} – {usd(a.reliefZone.to)} (50%–78.6% bounce) is where holders may consider taking profit; it is not a buy.
            </p>
          )}
        </div>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Rule-based and informational. Fibonacci levels are a common way to plan pullback entries, not a prediction.
      </p>
    </section>
  )
}
