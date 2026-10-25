import { CalendarDays, CircleDollarSign, Flag, PiggyBank, Receipt, Scale, Target } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PLValue } from '@/components/ui/PLValue'
import { formatDate, formatPercent, formatUsd } from '@/lib/formatters'
import { StatCard } from '@/features/dashboard/PortfolioSummary'
import type { CycleProgress } from './strategy.utils'

const STATUS_LABEL = { upcoming: 'Not started', active: 'Active', ended: 'Ended' } as const
const STATUS_TONE = { upcoming: 'info', active: 'positive', ended: 'neutral' } as const

/** Outstanding amount: "$12 behind" / "$8 ahead" / "On target". */
export function OutstandingText({ value }: { value: CycleProgress['outstanding'] }) {
  if (value.isZero()) return <span>On target</span>
  return value.gt(0) ? (
    <span className="text-destructive-text">{formatUsd(value)} behind</span>
  ) : (
    <span className="text-success-text">{formatUsd(value.neg())} ahead</span>
  )
}

export function CycleBar({ progress: p }: { progress: CycleProgress }) {
  const bar = Math.max(0, Math.min(100, p.progressPct.toNumber()))
  return (
    <section aria-label="Cycle" className="surface-card flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            {formatDate(p.cycle.startDate)} – {formatDate(p.endDate)}
          </span>
          <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
          {p.cycle.closedOn && <span className="text-xs text-muted-foreground">Closed early when the next cycle started</span>}
        </div>
        <span className="tabular text-sm text-muted-foreground" data-testid="cycle-day">
          {p.status === 'active' ? `Day ${p.currentDay} of ${p.totalDays}` : p.status === 'upcoming' ? `${p.totalDays} days` : `${p.totalDays} of ${p.totalDays} days`}
        </span>
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Progress to {formatUsd(p.cycleTarget, { dropZeroCents: true })} cycle target
          </span>
          <span className="tabular font-medium text-foreground">{formatPercent(p.progressPct, { signed: false })}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Progress toward cycle target"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(bar)}
        >
          <div className="h-full rounded-full bg-primary-solid" style={{ width: `${bar}%` }} />
        </div>
      </div>
    </section>
  )
}

/**
 * Cycle statistics for spot swing trading: the cycle target is the headline. Swing profits arrive
 * in steps (nothing for days, then one sale), so day-by-day figures are informational only.
 */
export function CycleStats({ progress: p }: { progress: CycleProgress }) {
  const remaining = p.cycleTarget.minus(p.realizedPL)
  const daysLeft = p.status === 'ended' ? 0 : p.totalDays - p.elapsedDays + (p.status === 'active' ? 1 : 0)
  return (
    <section aria-label="Cycle statistics" className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Cycle target"
        icon={<Flag className="h-4 w-4" aria-hidden />}
        value={formatUsd(p.cycleTarget, { dropZeroCents: true })}
        sub={`${formatPercent(p.progressPct, { signed: false })} reached · ${p.totalDays} days`}
        testId="stat-cycle-target"
      />
      <StatCard
        label="Realized this cycle"
        icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
        value={<PLValue value={p.realizedPL} />}
        sub={`${p.tradeCount} sale${p.tradeCount === 1 ? '' : 's'}${p.cumulativeReturnPct ? ` · ${formatPercent(p.cumulativeReturnPct)} on capital` : ''}`}
        testId="stat-realized"
      />
      <StatCard
        label="Remaining to target"
        icon={<Target className="h-4 w-4" aria-hidden />}
        value={remaining.gt(0) ? formatUsd(remaining) : 'Reached'}
        sub={p.status === 'ended' ? 'Cycle ended' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
        testId="stat-remaining"
      />
      <StatCard
        label="Pace"
        icon={<Scale className="h-4 w-4" aria-hidden />}
        value={<OutstandingText value={p.outstanding} />}
        sub={
          <span className="inline-flex items-center gap-1">
            vs an even daily pace
            <InfoTip
              label="pace"
              text="Compares realized profit with the cycle target spread evenly over the days so far. Swing trades pay out in steps, so being behind pace mid-cycle is normal; don't trade more to catch up."
            />
          </span>
        }
        testId="stat-pace"
      />
      {p.capital && (
        <StatCard
          label="Trading capital"
          icon={<PiggyBank className="h-4 w-4" aria-hidden />}
          value={formatUsd(p.capital, { dropZeroCents: true })}
          sub={`Target ${formatPercent(p.cycleTarget.dividedBy(p.capital).times(100), { signed: false })} of capital`}
          testId="stat-capital"
        />
      )}
      <StatCard
        label="Fees in realized P/L"
        icon={<Receipt className="h-4 w-4" aria-hidden />}
        value={formatUsd(p.fees)}
        sub="From your records"
        testId="stat-fees"
      />
    </section>
  )
}
