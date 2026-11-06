import { Target } from 'lucide-react'
import { useToast } from '@/components/ui/toast.context'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { useInvestmentMutations } from './investments.hooks'
import { targetMetrics, type LotMetrics } from './investments.utils'

/**
 * "Value at: Live | Targets" for every row in view that has a target. Sets each row's own switch,
 * so switching a filtered view can leave rows differing (then neither side is highlighted: "mixed").
 * Hidden when no row has a target.
 */
export function TargetsSwitch({ lots }: { lots: LotMetrics[] }) {
  const { switchTargets } = useInvestmentMutations()
  const toast = useToast()
  const withTarget = lots.filter((l) => targetMetrics(l) !== null)
  if (withTarget.length === 0) return null
  const onCount = withTarget.filter((l) => l.investment.targetEnabled).length
  const state = onCount === withTarget.length ? 'targets' : onCount === 0 ? 'live' : 'mixed'

  const set = (enabled: boolean) => {
    const ids = withTarget.filter((l) => l.investment.targetEnabled !== enabled).map((l) => l.investment.id)
    if (ids.length) switchTargets.mutate({ ids, enabled }, { onError: (e) => toast.error(errorMessage(e)) })
  }
  const option = (enabled: boolean, active: boolean, label: React.ReactNode, title: string) => (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      disabled={switchTargets.isPending}
      onClick={() => set(enabled)}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 pointer-coarse:py-2',
        active ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Value at</span>
      <div role="group" aria-label="Value rows with a target at" className="inline-flex items-center rounded-full border border-border bg-muted p-0.5">
        {option(false, state === 'live', 'Live prices', 'Value every row at the live price')}
        {option(
          true,
          state === 'targets',
          <>
            <Target className="h-3.5 w-3.5" aria-hidden /> My targets
          </>,
          'Value rows with a target at that target (planned figures)',
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {state === 'mixed' ? `Mixed: ${onCount} of ${withTarget.length} rows at target` : `${withTarget.length} row${withTarget.length === 1 ? '' : 's'} with a target`}
      </span>
    </div>
  )
}
