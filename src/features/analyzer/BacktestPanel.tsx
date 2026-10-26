import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Info } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { InfoTip } from '@/components/ui/InfoTip'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import { describeMarketDataError } from '@/features/prices/coingecko.service'
import { fetchKlinesRange, INTERVAL_MS, splitClosed, type Interval } from './binance.service'
import { BACKTEST, runBacktest, STRATEGY_LABEL, type BacktestPart } from './backtest'
import { formatPkt } from './time'

const usd = (n: number) => formatPrice(n.toFixed(2))
const signedUsd = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`
const plText = (n: number) => (n > 0 ? 'text-success-text' : n < 0 ? 'text-destructive-text' : 'text-foreground')

interface Props {
  symbol: string
  interval: Interval
  timeframe: string
  priceInterval: number
  orderUsd: number
  strength: number
}

function PartTable({ title, part }: { title: string; part: BacktestPart }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">
        {title} · {formatPkt(part.from, { withZone: false })} – {formatPkt(part.to)} · {part.candles} candles
      </span>
      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="tabular w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Rule</th>
              <th className="px-3 py-2 text-right font-medium">Net P/L</th>
              <th className="px-3 py-2 text-right font-medium">Profit factor</th>
              <th className="px-3 py-2 text-right font-medium">Max drawdown</th>
              <th className="px-3 py-2 text-right font-medium">Trades</th>
              <th className="px-3 py-2 text-right font-medium">Win rate</th>
              <th className="px-3 py-2 text-right font-medium">Avg / trade</th>
              <th className="px-3 py-2 text-right font-medium">Max invested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {part.results.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-2 font-medium whitespace-nowrap text-foreground">{STRATEGY_LABEL[r.key]}</td>
                <td className={cn('px-3 py-2 text-right whitespace-nowrap', plText(r.netPnl))}>
                  {signedUsd(r.netPnl)}
                  {r.openOrders > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      incl. {r.openOrders} open ({signedUsd(r.openPnl)})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{r.profitFactor === null ? (r.trades > 0 ? 'no losses' : '—') : r.profitFactor.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{usd(r.maxDrawdown)}</td>
                <td className="px-3 py-2 text-right">{r.trades}</td>
                <td className="px-3 py-2 text-right">{r.winRate === null ? '—' : `${r.winRate.toFixed(0)}%`}</td>
                <td className={cn('px-3 py-2 text-right', r.avgReturnPct !== null && plText(r.avgReturnPct))}>{r.avgReturnPct === null ? '—' : `${r.avgReturnPct.toFixed(2)}%`}</td>
                <td className="px-3 py-2 text-right">{usd(r.maxExposure)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Tests the structure rules against fixed-interval buying on older candles (loaded on request). */
export function BacktestPanel({ symbol, interval, timeframe, priceInterval, orderUsd, strength }: Props) {
  const [requested, setRequested] = useState(false)
  const [fee, setFee] = useState(String(BACKTEST.defaultFeePct))
  const history = useQuery({
    queryKey: ['binance-history', symbol, interval, BACKTEST.candles],
    queryFn: ({ signal }) => {
      const endTime = Date.now()
      return fetchKlinesRange({ symbol, interval, startTime: endTime - BACKTEST.candles * INTERVAL_MS[interval], endTime }, signal)
    },
    enabled: requested,
    staleTime: 10 * 60_000,
  })
  const feePct = Number(fee)
  const feeValid = fee.trim() !== '' && feePct >= 0 && feePct < 5
  const report = useMemo(() => {
    if (!history.data || !feeValid) return null
    // The candle still forming when the history was fetched is never used: it wasn't finished.
    const { closed } = splitClosed(history.data, history.dataUpdatedAt)
    return runBacktest(closed, { interval: priceInterval, orderUsd, feePct, strength })
  }, [history.data, history.dataUpdatedAt, feeValid, priceInterval, orderUsd, feePct, strength])

  return (
    <section aria-labelledby="backtest-h" className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <h2 id="backtest-h" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Backtest: does structure help?
          <InfoTip
            label="backtest"
            text="Buy every interval: buy each time a close is one interval below the last fill, sell each buy one interval higher. BOS rules: buy once after a bullish break of structure, sell one interval higher or on a bearish break. Decisions use only candles closed at that time and fill at the candle close. Open positions at the end are valued at the last close."
          />
        </h2>
        <p className="text-xs text-muted-foreground">
          Up to {BACKTEST.candles.toLocaleString()} closed {timeframe} candles from Binance. First {Math.round(BACKTEST.inSampleFraction * 100)}% is the test period, the last{' '}
          {Math.round((1 - BACKTEST.inSampleFraction) * 100)}% is out of sample (results the rules were never tuned on).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Input label="Fee per side (%)" type="number" inputMode="decimal" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} error={feeValid ? undefined : 'Enter 0 to 5'} />
        </div>
        <Button icon={<FlaskConical className="h-4 w-4" aria-hidden />} loading={history.isFetching} onClick={() => (requested ? void history.refetch() : setRequested(true))}>
          {history.data ? 'Reload history' : 'Run backtest'}
        </Button>
        <span className="text-xs text-muted-foreground">
          Interval {usd(priceInterval)} · {usd(orderUsd)} per buy · sensitivity {strength} candles
        </span>
      </div>

      {history.isError && (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          {describeMarketDataError(history.error)} Try again in a minute.
        </p>
      )}

      {report &&
        (report.inSample && report.outOfSample ? (
          <div className="flex flex-col gap-4">
            <PartTable title="Test period" part={report.inSample} />
            <PartTable title="Out of sample" part={report.outOfSample} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough history on this timeframe for a test and an out-of-sample period.</p>
        ))}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Past results only. A rule that did well here can still lose money later; trust it only if it also holds up out of sample. Fills at the candle close ignore slippage.
      </p>
    </section>
  )
}
