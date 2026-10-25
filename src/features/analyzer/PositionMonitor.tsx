import { Link } from 'react-router'
import { Badge } from '@/components/ui/Badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PLValue } from '@/components/ui/PLValue'
import { cn } from '@/lib/cn'
import { D } from '@/lib/decimal'
import { formatDate, formatPrice, formatQuantity } from '@/lib/formatters'
import { positionView, type MarketSignals, type OpenLot, type PositionAction } from './positions'

const usd = (n: number) => formatPrice(n.toFixed(2))

const ACTION = {
  hold: { label: 'Hold', tone: 'positive', box: 'border-success/40 bg-success/5' },
  'take-profit': { label: 'Take profit', tone: 'warning', box: 'border-warning/40 bg-warning/10' },
  exit: { label: 'Exit', tone: 'negative', box: 'border-destructive/40 bg-destructive/10' },
} as const satisfies Record<PositionAction, { label: string; tone: string; box: string }>

/** Hold / Take profit / Exit for each open ETH lot, from the current chart. */
export function PositionMonitor({ lots, signals, price, timeframe }: { lots: OpenLot[]; signals: MarketSignals | null; price: number; timeframe: string }) {
  return (
    <section aria-labelledby="pos-h" className="surface-card flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <h2 id="pos-h" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          My ETH positions
          <InfoTip
            label="position monitor"
            text="Open ETH lots from your Investments page, checked against this chart's closed candles. Exit: a candle closed below the latest swing low or below the 200-candle average. Take profit: a sell-zone level was swept and closed back below, or price reached the Fibonacci 161.8% target. Otherwise hold. Nothing is sold automatically."
          />
        </h2>
        <p className="text-xs text-muted-foreground">Exit signals from the {timeframe} chart. Swing positions are held until one of these exit conditions is met.</p>
      </div>

      {lots.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open ETH positions on the{' '}
          <Link to="/investments" className="text-primary-text hover:underline">
            Investments
          </Link>{' '}
          page.
        </p>
      ) : !signals ? (
        <p className="text-sm text-muted-foreground">Not enough candles to check exits yet.</p>
      ) : (
        <>
          <div className={cn('rounded-xl border p-3', ACTION[signals.action].box)}>
            <div className="flex items-center gap-2">
              <Badge tone={ACTION[signals.action].tone} size="lg">
                {ACTION[signals.action].label}
              </Badge>
              <span className="text-sm font-medium text-foreground">for all open ETH on this chart</span>
            </div>
            <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
              {signals.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="tabular w-full min-w-[640px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 text-left font-medium">Bought</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">ETH</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Cost / ETH</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">P/L now</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    At exit level{signals.exitLevel !== null ? ` ${usd(signals.exitLevel)}` : ''}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    At next target{signals.nextTarget ? ` ${usd(signals.nextTarget.price)}` : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => {
                  const v = positionView(lot, signals, price)
                  return (
                    <tr key={lot.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{formatDate(lot.buyDate)}</td>
                      <td className="px-3 py-2 text-right">{formatQuantity(lot.quantity.toFixed(8))}</td>
                      <td className="px-3 py-2 text-right">{usd(lot.costPerCoin)}</td>
                      <td className="px-3 py-2 text-right">
                        <PLValue value={new D(v.pnl.toFixed(2))} format="amount" />
                        <span className="block text-xs text-muted-foreground">{v.pnlPct >= 0 ? '+' : ''}{v.pnlPct.toFixed(2)}%</span>
                      </td>
                      <td className="px-3 py-2 text-right">{v.pnlAtExit !== null ? <PLValue value={new D(v.pnlAtExit.toFixed(2))} format="amount" icon={false} /> : '—'}</td>
                      <td className="px-3 py-2 text-right">{v.pnlAtTarget !== null ? <PLValue value={new D(v.pnlAtTarget.toFixed(2))} format="amount" icon={false} /> : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
