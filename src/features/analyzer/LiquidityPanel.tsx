import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Info, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import { formatPkt } from './time'
import { levelLabel, levelReasons, type LiquidityAnalysis, type LiquidityLevel, type Scenario } from './liquidity'

const usd = (n: number) => formatPrice(n.toFixed(2))
const pct = (level: number, price: number) => `${level >= price ? '+' : '−'}${((Math.abs(level - price) / price) * 100).toFixed(2)}%`

/** How many levels each list shows (the chart shows fewer). */
const LIST_LIMIT = 6

const EVENT_LABEL = { swept: 'Sweep', 'failed-breakout': 'Failed breakout', broken: 'Break' } as const


function LevelList({ title, icon, levels, price, tone }: { title: string; icon: ReactNode; levels: LiquidityLevel[]; price: number; tone: 'above' | 'below' }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className={cn('inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase', tone === 'above' ? 'text-[var(--chart-liquidity-above)]' : 'text-[var(--chart-liquidity-below)]')}>
        {icon}
        {title}
      </h3>
      {levels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open levels in the loaded history.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
          {levels.slice(0, LIST_LIMIT).map((l) => (
            <li key={l.id} className="tabular flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium text-foreground">{levelLabel(l)}</span>
                {l.strength === 'major' && <Badge tone="warning">Major</Badge>}
                <InfoTip label={levelLabel(l)} text={levelReasons(l, price).join(' ')} />
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="font-semibold text-foreground">{usd(l.price)}</span>
                <span className="text-xs text-muted-foreground">{pct(l.price, price)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScenarioCard({ s }: { s: Scenario }) {
  const bull = s.bias === 'bullish'
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border p-3', bull ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-sm font-semibold', bull ? 'text-success-text' : 'text-destructive-text')}>
          {bull ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
          {bull ? 'Bullish scenario' : 'Bearish scenario (spot: avoid buying / take profit)'}
        </span>
        <Badge tone={s.status === 'triggered' ? (bull ? 'positive' : 'negative') : 'neutral'}>
          {s.status === 'triggered' ? 'Triggered' : s.status === 'watching' ? 'Watching' : 'No level'}
        </Badge>
      </div>
      <p className="text-sm text-foreground">{s.summary}</p>
      <dl className="tabular grid grid-cols-1 gap-2 text-xs min-[380px]:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Level</dt>
          <dd className="font-medium text-foreground">{s.trigger ? `${levelLabel(s.trigger)} ${usd(s.trigger.price)}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Next target</dt>
          <dd className="font-medium text-foreground">{s.target ? usd(s.target.price) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Invalidation</dt>
          <dd className="font-medium text-foreground">{s.invalidation !== null ? usd(s.invalidation) : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}

export function LiquidityPanel({ analysis: a }: { analysis: LiquidityAnalysis }) {
  return (
    <section aria-labelledby="liq-h" className="surface-card flex flex-col gap-4 p-4 sm:p-5">
      <div>
        <h2 id="liq-h" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          Liquidity levels
          <InfoTip
            label="liquidity levels"
            text="Obvious highs and lows (swing points, equal highs/lows, previous day/week/month range) where stop-loss and breakout orders tend to gather. Price often moves toward them. This is a tendency, not knowledge of real orders. Lines on the chart: teal above the price, pink below; thicker = major."
          />
        </h2>
        <p className="text-xs text-muted-foreground">Updated as the price moves: levels above the price are drawn in teal, below in pink.</p>
      </div>

      {a.testing.length > 0 && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Price is trading beyond {a.testing.map((l) => `${levelLabel(l)} ${usd(l.price)}`).join(', ')} right now. If the current candle closes back inside, it
          counts as a sweep; if it closes beyond, as a break.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LevelList title="Below the price (buy zone)" icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden />} levels={a.below} price={a.price} tone="below" />
        <LevelList title="Above the price (sell zone)" icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden />} levels={a.above} price={a.price} tone="above" />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ScenarioCard s={a.bullish} />
        <ScenarioCard s={a.bearish} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent sweeps and breaks</h3>
        {a.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No level was reached in the last 12 closed candles.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {a.events.slice(0, 6).map((e) => (
              <li key={`${e.level.id}-${e.index}`} className={cn('tabular flex flex-wrap items-center gap-x-2 gap-y-0.5', e.invalidated && 'opacity-60')}>
                <Badge tone={e.bias === 'bullish' ? 'positive' : 'negative'}>{EVENT_LABEL[e.type]}</Badge>
                <span className="text-foreground">
                  {levelLabel(e.level)} {usd(e.level.price)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatPkt(e.time)} · {e.bias}
                  {e.invalidated && ' · no longer valid (price closed beyond the sweep)'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Rule-based and informational. Nobody can see where stop orders really are, and price can move through any level.
      </p>
    </section>
  )
}
