import type { ReactNode } from 'react'
import { AlertTriangle, Briefcase, CircleDollarSign, Coins, Percent, PiggyBank, TrendingUp, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/LoadingState'
import { PLValue } from '@/components/ui/PLValue'
import { formatPercent, formatUsd } from '@/lib/formatters'
import type { PortfolioSummary as Summary } from '@/features/investments/investments.utils'

interface CardProps {
  label: string
  icon: ReactNode
  value: ReactNode
  sub?: ReactNode
  testId?: string
}

/** Equal-height summary card: label row, value, and a one-line footnote pinned to the bottom. */
export function StatCard({ label, icon, value, sub, testId }: CardProps) {
  return (
    <div className="surface-card flex h-full min-h-28 min-w-0 flex-col p-3 sm:p-4" data-testid={testId}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
      </div>
      {/* Wraps rather than truncating: on a 2-column phone grid a cut-off amount would be misleading. */}
      <div className="tabular mt-2 text-lg font-semibold tracking-tight wrap-anywhere text-foreground sm:text-xl [&_.whitespace-nowrap]:whitespace-normal">
        {value}
      </div>
      {sub && <div className="mt-auto pt-1 text-xs leading-snug text-muted-foreground">{sub}</div>}
    </div>
  )
}

export function PortfolioSummary({ summary, loading }: { summary: Summary | null; loading?: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-busy="true">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  }

  const partial = !summary.isComplete
  const partialNote = partial ? (
    <span className="inline-flex items-center gap-1 text-warning-text">
      <AlertTriangle className="h-3 w-3" aria-hidden /> Excludes {summary.missingPriceCoinIds.length} unpriced coin
      {summary.missingPriceCoinIds.length === 1 ? '' : 's'}
    </span>
  ) : null

  return (
    <section aria-label="Portfolio summary" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="Total Invested"
          icon={<PiggyBank className="h-4 w-4" aria-hidden />}
          value={formatUsd(summary.totalPurchaseCost)}
          sub={`Remaining cost basis ${formatUsd(summary.remainingCostBasis)}`}
          testId="card-total-invested"
        />
        <StatCard
          label="Current Value"
          icon={<Wallet className="h-4 w-4" aria-hidden />}
          value={formatUsd(summary.currentValue)}
          sub={partialNote ?? 'Open positions at market price'}
          testId="card-current-value"
        />
        <StatCard
          label="Unrealized P/L"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          value={<PLValue value={summary.unrealizedPL} />}
          sub={<PLValue value={summary.unrealizedROI} format="percent" icon={false} />}
          testId="card-unrealized"
        />
        <StatCard
          label="Realized P/L"
          icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
          value={<PLValue value={summary.realizedPL} />}
          sub={summary.soldCostBasis.gt(0) ? `${formatPercent(summary.realizedROI)} on sold cost` : 'No sales yet'}
          testId="card-realized"
        />
        <StatCard
          label="Total Return"
          icon={<Briefcase className="h-4 w-4" aria-hidden />}
          value={<PLValue value={summary.totalPL} />}
          sub="Realized + unrealized"
          testId="card-total-return"
        />
        <StatCard
          label="Overall ROI"
          icon={<Percent className="h-4 w-4" aria-hidden />}
          value={<PLValue value={summary.overallROI} format="percent" />}
          sub={partial ? partialNote : `On ${formatUsd(summary.applicableCostBasis)} cost basis`}
          testId="card-roi"
        />
        <StatCard
          label="Holdings"
          icon={<Coins className="h-4 w-4" aria-hidden />}
          value={summary.openLotCount}
          sub={`${summary.coinsHeld} coin${summary.coinsHeld === 1 ? '' : 's'} · ${summary.longTermLotCount} long-term · ${summary.soldLotCount} sold`}
          testId="card-holdings"
        />
      </div>
      {partial && (
        <p role="note" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          No current price for: {summary.missingPriceCoinIds.join(', ')}. Their value and unrealized P/L are left out of the totals (cost basis{' '}
          {formatUsd(summary.unpricedCostBasis)} excluded from ROI) instead of being counted as zero.
        </p>
      )}
    </section>
  )
}
