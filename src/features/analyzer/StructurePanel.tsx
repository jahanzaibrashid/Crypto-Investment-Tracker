import { AlertTriangle, Info, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import { formatPkt } from './time'
import type { IntervalPlan } from './intervalPlan'
import { SENSITIVITIES, type StructureAnalysis, type SwingPoint, type Trend } from './structure'

const usd = (n: number) => formatPrice(n.toFixed(2))
const signedUsd = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`
const signedPct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`
const eth = (n: number) => `${n.toFixed(4)} ETH`
const plText = (n: number) => (n >= 0 ? 'text-success-text' : 'text-destructive-text')

/** Swing points listed in the table (newest first). */
const SWING_ROWS = 8

export interface StructureSettings {
  /** Candles each side of a swing point; 'auto' follows the timeframe. */
  sensitivity: 'auto' | number
  /** Raw input text, so the field can be edited freely; parsed by the page. */
  interval: string
  orderUsd: string
}

const TREND = {
  up: { label: 'Uptrend', tone: 'positive', icon: TrendingUp, text: 'text-success-text' },
  down: { label: 'Downtrend', tone: 'negative', icon: TrendingDown, text: 'text-destructive-text' },
  sideways: { label: 'Sideways', tone: 'neutral', icon: Minus, text: 'text-muted-foreground' },
} as const satisfies Record<Trend, unknown>

const LABEL_TEXT = { HH: 'Higher high', HL: 'Higher low', LH: 'Lower high', LL: 'Lower low' } as const

function swingName(s: SwingPoint) {
  return s.label ? `${s.label} · ${LABEL_TEXT[s.label]}` : s.type === 'high' ? 'Swing high' : 'Swing low'
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-semibold text-foreground">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

interface Props {
  analysis: StructureAnalysis | null
  plan: IntervalPlan | null
  price: number
  autoStrength: number
  settings: StructureSettings
  onSettings: (s: StructureSettings) => void
  /** Text shown instead of the analysis when there is none (e.g. too few candles). */
  emptyText: string
}

export function StructurePanel({ analysis: a, plan, price, autoStrength, settings, onSettings, emptyText }: Props) {
  const t = a ? TREND[a.trend] : null
  const swings = a ? [...a.swings].reverse().slice(0, SWING_ROWS) : []
  const m = a?.metrics
  // Live price beyond an unbroken level: not a break until a candle closes there.
  const pending =
    a && a.bosLevels.high !== null && price > a.bosLevels.high
      ? `Price is above the swing high ${usd(a.bosLevels.high)} right now. It becomes a bullish break only if a candle closes above it.`
      : a && a.bosLevels.low !== null && price < a.bosLevels.low
        ? `Price is below the swing low ${usd(a.bosLevels.low)} right now. It becomes a bearish break only if a candle closes below it.`
        : null

  return (
    <section aria-labelledby="structure-h" className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <h2 id="structure-h" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Market structure
          <InfoTip
            label="market structure"
            text="Swing highs and lows from closed candles. HH/HL = higher high / higher low, LH/LL = lower high / lower low. A break of structure (BOS) needs a candle to close beyond the latest swing high or low; a wick alone doesn't count. Points marked ? are provisional and can still change."
          />
        </h2>
        <p className="text-xs text-muted-foreground">From closed candles only. Swing points marked ? are provisional until enough candles close after them.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
        <Select
          label="Swing sensitivity"
          value={String(settings.sensitivity)}
          onChange={(e) => onSettings({ ...settings, sensitivity: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}
          options={[
            { value: 'auto', label: `Auto (${autoStrength} candles)` },
            ...SENSITIVITIES.map((n) => ({ value: String(n), label: `${n} candles each side${n <= 2 ? ' (more swings)' : n >= 8 ? ' (fewer swings)' : ''}` })),
          ]}
        />
        <Input label="Price interval ($)" type="number" inputMode="decimal" min={1} step="any" value={settings.interval} onChange={(e) => onSettings({ ...settings, interval: e.target.value })} />
        <Input label="Buy per level ($)" type="number" inputMode="decimal" min={1} step="any" value={settings.orderUsd} onChange={(e) => onSettings({ ...settings, orderUsd: e.target.value })} />
      </div>

      {!a || !t || !m ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2">
              <t.icon className={cn('h-5 w-5', t.text)} aria-hidden />
              <span className={cn('text-base font-semibold', t.text)}>{t.label}</span>
              <Badge tone={a.ema.bias === 'bullish' ? 'positive' : a.ema.bias === 'bearish' ? 'negative' : 'neutral'}>EMA 20/50 {a.ema.bias}</Badge>
              {a.emaConfirms !== null && <Badge tone={a.emaConfirms ? 'positive' : 'warning'}>{a.emaConfirms ? 'EMA confirms' : 'EMA disagrees'}</Badge>}
            </div>
            <p className="text-sm text-foreground">{a.trendReason}</p>
            {a.trend === 'down' && <p className="text-sm text-muted-foreground">Spot: buying into a downtrend adds exposure while lower lows keep forming. Waiting for a bullish break is the structure-based alternative.</p>}
          </div>

          {a.recentBreak && (
            <p role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-foreground', a.recentBreak.bias === 'bullish' ? 'border-success/40 bg-success/10' : 'border-destructive/40 bg-destructive/10')}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {a.recentBreak.bias === 'bullish' ? 'Bullish' : 'Bearish'} break of structure: the candle of {formatPkt(a.recentBreak.time)} closed at {usd(a.recentBreak.close)},{' '}
              {a.recentBreak.bias === 'bullish' ? 'above the swing high' : 'below the swing low'} {usd(a.recentBreak.level)}.
            </p>
          )}
          {pending && (
            <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
              {pending}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Latest swing high" value={a.latestHigh ? usd(a.latestHigh.price) : '—'} hint={a.latestHigh ? `${a.latestHigh.label ?? 'first'} · ${formatPkt(a.latestHigh.time)}` : undefined} />
            <Stat label="Latest swing low" value={a.latestLow ? usd(a.latestLow.price) : '—'} hint={a.latestLow ? `${a.latestLow.label ?? 'first'} · ${formatPkt(a.latestLow.time)}` : undefined} />
            <Stat label="Bullish break above" value={a.bosLevels.high !== null ? usd(a.bosLevels.high) : '—'} hint="Needs a candle close above" />
            <Stat label="Bearish break below" value={a.bosLevels.low !== null ? usd(a.bosLevels.low) : '—'} hint="Needs a candle close below" />
          </dl>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Price behaviour (loaded history)</h3>
            <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Stat label="Average decline" value={m.avgDecline ? `${usd(m.avgDecline.amount)} (${m.avgDecline.pct.toFixed(2)}%)` : '—'} hint={`Swing high → next swing low, ${m.declines.length} drops`} />
              <Stat label="Average retracement" value={m.avgRetracementPct !== null ? `${m.avgRetracementPct.toFixed(1)}% of the drop` : '—'} hint="Bounce to the next swing high" />
              <Stat label="Average change between lows" value={m.avgLowDiff !== null ? signedUsd(m.avgLowDiff) : '—'} hint="Negative = lower lows" />
              <Stat
                label="Trend slope (regression)"
                value={m.slope ? `${signedUsd(m.slope.perDay)} / day` : '—'}
                hint={m.slope ? `${signedPct(m.slope.pctPerDay)} per day · R² ${m.slope.r2.toFixed(2)} · last ${m.slope.candles} candles` : undefined}
              />
              <Stat label="Volatility (ATR 14)" value={m.atr ? `${usd(m.atr.value)} (${m.atr.pct.toFixed(2)}%)` : '—'} hint="Average range of one candle" />
              <Stat label="Estimated next low (estimate)" value={m.estimatedLow ? usd(m.estimatedLow.price) : '—'} hint={m.estimatedLow ? `Not a target: ${m.estimatedLow.method}` : 'Not enough swings for an estimate'} />
            </dl>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent swing points</h3>
            {swings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No swing points in the loaded history at this sensitivity.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
                {swings.map((s) => {
                  const d = m.declines.find((x) => x.toTime === s.time)
                  return (
                    <li key={`${s.type}-${s.index}`} className="tabular flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Badge tone={s.label === 'HH' || s.label === 'HL' ? 'positive' : s.label ? 'negative' : 'neutral'}>{s.label ?? (s.type === 'high' ? 'H' : 'L')}</Badge>
                        <span className="text-foreground">{swingName(s)}</span>
                        {!s.confirmed && <Badge tone="warning">Provisional</Badge>}
                      </span>
                      <span className="flex shrink-0 flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-foreground">{usd(s.price)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatPkt(s.time)}
                          {d && ` · drop ${usd(d.amount)} (${d.pct.toFixed(1)}%)${d.retracementPct !== null ? `, ${d.retracementPct.toFixed(0)}% won back` : ''}`}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {plan && <IntervalPlanView plan={plan} trend={a.trend} />}
        </>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Rule-based and informational. Averages and estimates describe past swings in the loaded candles; they don't predict the next move. Nothing here places orders.
      </p>
    </section>
  )
}

function IntervalPlanView({ plan: p, trend }: { plan: IntervalPlan; trend: Trend }) {
  const w = p.wait
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Buy every {usd(p.interval)} · {usd(p.orderUsd)} per level
      </h3>

      {p.holding ? (
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Your ETH (open lots)" value={eth(p.holding.quantity)} />
          <Stat label="Average entry" value={usd(p.holding.avgEntry)} hint={`Cost ${usd(p.holding.cost)}`} />
          <Stat label="Value now" value={usd(p.holding.value)} />
          <Stat label="Unrealized P/L" value={signedUsd(p.holding.pnl)} hint={signedPct(p.holding.pnlPct)} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No open ETH lots in your portfolio; the ladder below starts from zero.</p>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">If price falls through each buy level{p.holding ? ' (totals include your ETH)' : ''}</span>
          <div className="overflow-x-auto rounded-lg border border-border bg-background">
            <table className="tabular w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-medium">Buy at</th>
                  <th className="px-3 py-2 text-right font-medium">Total ETH</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Avg entry</th>
                  <th className="px-3 py-2 text-right font-medium">P/L there</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.buyLevels.map((r) => (
                  <tr key={r.level}>
                    <td className="px-3 py-2 font-medium text-foreground">{usd(r.level)}</td>
                    <td className="px-3 py-2 text-right">{r.totalEth.toFixed(4)}</td>
                    <td className="px-3 py-2 text-right">{usd(r.totalCost)}</td>
                    <td className="px-3 py-2 text-right">{usd(r.avgEntry)}</td>
                    <td className={cn('px-3 py-2 text-right', plText(r.pnlAtLevel))}>
                      {signedUsd(r.pnlAtLevel)} <span className="text-xs">({signedPct(r.pnlPct)})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Sell levels{p.holding ? ' (P/L of your ETH if sold there)' : ''}</span>
          <ul className="tabular flex flex-col divide-y divide-border rounded-lg border border-border bg-background text-sm">
            {p.sellLevels.map((r) => (
              <li key={r.level} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium text-foreground">{usd(r.level)}</span>
                {r.pnl !== null && <span className={plText(r.pnl)}>{signedUsd(r.pnl)}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {w ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3 text-sm">
            <span className="font-semibold text-foreground">Buy every level ({p.buyLevels.length} buys)</span>
            <span className="text-muted-foreground">
              {usd(w.cost)} buys {eth(w.ladderEth)} at an average {usd(w.ladderAvgEntry)}.
            </span>
            <span className="text-muted-foreground">
              Back at the break level {usd(w.bosLevel)}: <span className={plText(w.ladderPnlAtBos)}>{signedUsd(w.ladderPnlAtBos)}</span>.
            </span>
            {w.ladderPnlAtEstimate !== null && (
              <span className="text-muted-foreground">
                At the estimated low: <span className={plText(w.ladderPnlAtEstimate)}>{signedUsd(w.ladderPnlAtEstimate)}</span> (estimate).
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-3 text-sm">
            <span className="font-semibold text-foreground">Wait for a bullish break</span>
            <span className="text-muted-foreground">
              Buy after a candle closes above {usd(w.bosLevel)}: the same {usd(w.cost)} buys {eth(w.waitEth)}.
            </span>
            <span className="text-muted-foreground">
              Fewer ETH and a higher entry, but no exposure while {trend === 'down' ? 'lower lows keep forming' : 'price falls'}; if price never breaks, nothing is bought.
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No unbroken swing high to wait for: the last swing high was already broken (or none is confirmed yet).</p>
      )}
    </div>
  )
}
