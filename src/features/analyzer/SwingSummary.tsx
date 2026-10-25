import { CheckCircle2, Clock, Eye, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPrice } from '@/lib/formatters'
import type { FibAnalysis } from './fibonacci'
import type { LiquidityAnalysis } from './liquidity'
import type { PositionAction } from './positions'
import type { TradeSetup } from './setup'

const usd = (n: number) => formatPrice(n.toFixed(2))

type Tone = 'buy' | 'wait' | 'avoid' | 'view'

const TONE = {
  buy: { box: 'border-success/50 bg-success/10', text: 'text-success-text', icon: CheckCircle2 },
  wait: { box: 'border-primary/40 bg-primary/5', text: 'text-primary-text', icon: Clock },
  avoid: { box: 'border-destructive/40 bg-destructive/10', text: 'text-destructive-text', icon: TrendingDown },
  view: { box: 'border-border bg-muted', text: 'text-muted-foreground', icon: Eye },
} as const

const POSITION_TEXT: Record<PositionAction, string> = { hold: 'hold', 'take-profit': 'consider taking profit', exit: 'exit signal' }

interface Props {
  role: 'swing' | 'entry' | 'view'
  timeframe: string
  setup: TradeSetup | null
  fib: FibAnalysis | null
  liquidity: LiquidityAnalysis | null
  /** Action for open ETH positions, when there are any. */
  positions: PositionAction | null
}

/** One-line spot swing verdict combining the strategies, shown above the chart. */
export function SwingSummary({ role, timeframe, setup, fib, liquidity, positions }: Props) {
  let tone: Tone
  let headline: string
  const details: string[] = []
  const trendDown = setup?.conditions.find((c) => c.id === 'trend')?.met === false

  if (role === 'view') {
    tone = 'view'
    headline = `${timeframe} is for viewing only. Switch to 4 hours, 12 hours or 1 day for swing setups.`
  } else if (setup?.status === 'valid' && setup.entry && setup.stopLoss !== null) {
    tone = 'buy'
    headline = `${role === 'entry' ? '1-hour entry timing: ' : ''}Buy setup: entry ${usd(setup.entry.from)}–${usd(setup.entry.to)}, stop-loss ${usd(setup.stopLoss)}, TP1 ${usd(setup.targets[0]!.price)}`
    if (role === 'entry') details.push('Take it only if 4 hours, 12 hours or 1 day also shows a setup or an uptrend.')
  } else if (trendDown) {
    tone = 'avoid'
    headline = `Avoid new buys: ${timeframe} is in a downtrend.`
    if (fib?.reliefZone) details.push(`Holders may take profit on a bounce into ${usd(fib.reliefZone.from)}–${usd(fib.reliefZone.to)}.`)
  } else if (fib?.limit) {
    tone = 'wait'
    headline = `Wait for a pullback. Buy-limit option ${usd(fib.limit.price)} (stop ${usd(fib.limit.stopLoss)}, target ${usd(fib.limit.target)}).`
    details.push(fib.limit.reason)
  } else {
    tone = 'wait'
    headline = setup ? `Wait: ${setup.title.charAt(0).toLowerCase()}${setup.title.slice(1)}.` : 'No swing setup right now.'
  }

  if (role !== 'view' && liquidity?.bearish.status === 'triggered' && liquidity.bearish.trigger) {
    details.push(`Sell-zone level ${usd(liquidity.bearish.trigger.price)} was swept: don't chase price up here.`)
  }
  if (positions) details.push(`Your open ETH: ${POSITION_TEXT[positions]} `)

  const t = TONE[tone]
  const Icon = t.icon
  return (
    <section aria-label="Swing summary" className={cn('flex items-start gap-3 rounded-2xl border p-4', t.box)}>
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', t.text)} aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{headline}</p>
        {details.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
