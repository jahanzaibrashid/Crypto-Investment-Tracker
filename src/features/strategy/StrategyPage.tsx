import { useMemo, useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/LoadingState'
import { useNow } from '@/hooks/useNow'
import { errorMessage } from '@/lib/errors'
import { todayIso } from '@/lib/formatters'
import { PortfolioGate } from '@/features/dashboard/DashboardLayout'
import { usePortfolio } from '@/features/dashboard/portfolio.context'
import { CycleDialog, type CycleDialogMode } from './CycleDialog'
import { CycleCard } from './CycleCard'
import type { TradingCycle } from './strategy.types'
import { useCycleMutations, useTradingCycles } from './strategy.hooks'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/toast.context'
import { formatDate } from '@/lib/formatters'
import { buildCycleProgress, cycleEndDate, realizedByDate, realizedTrades } from './strategy.utils'

/**
 * Trading Strategy & Profit Targets: daily targets with carry-over, tracked against the realized
 * P/L of sales already recorded on the Investments page. Informational only; no trading.
 */
export function StrategyPage() {
  const { investmentsQuery, lots } = usePortfolio()
  const cyclesQuery = useTradingCycles()
  const cycles = useMemo(() => cyclesQuery.data ?? [], [cyclesQuery.data])
  // Re-render each minute so "today" moves on at midnight.
  const today = todayIso(new Date(useNow(60_000)))

  const trades = useMemo(() => realizedTrades(lots), [lots])
  const byDate = useMemo(() => realizedByDate(trades), [trades])
  const progress = useMemo(() => cycles.map((c) => buildCycleProgress(c, byDate, today)), [cycles, byDate, today])

  // The latest cycle is the default for a new cycle's settings.
  const latest = cycles[0] ?? null

  const [dialog, setDialog] = useState<CycleDialogMode | null>(null)
  const { remove } = useCycleMutations()
  const toast = useToast()
  const [deleting, setDeleting] = useState<TradingCycle | null>(null)
  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await remove.mutateAsync(deleting.id)
      toast.success(`Cycle ${formatDate(deleting.startDate)} – ${formatDate(cycleEndDate(deleting))} deleted. Your trades are unchanged.`)
      setDeleting(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const loading = cyclesQuery.isLoading || investmentsQuery.isLoading

  return (
    <>
      <PageHeader
        title="Trading Strategy & Profit Targets"
        description="Daily profit targets tracked against your realized trades. Informational only."
        actions={
          <>
            <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setDialog({ kind: 'start', latest })} disabled={cyclesQuery.isLoading}>
              Start new cycle
            </Button>
          </>
        }
      />
      <PortfolioGate>
        {cyclesQuery.isError ? (
          <ErrorState
            title="Could not load your trading cycles"
            message={errorMessage(cyclesQuery.error)}
            onRetry={() => cyclesQuery.refetch()}
            retrying={cyclesQuery.isFetching}
          />
        ) : loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
          </div>
        ) : progress.length > 0 ? (
          <>
            {/* Every cycle, newest first; each opens on click and has its own Edit / Delete. */}
            {progress.map((p) => (
              <CycleCard key={p.cycle.id} progress={p} onEdit={() => setDialog({ kind: 'edit', cycle: p.cycle })} onDelete={() => setDeleting(p.cycle)} />
            ))}
          </>
        ) : (
          <div className="surface-card">
            <EmptyState
              icon={<Target className="h-5 w-5" aria-hidden />}
              title="No trading cycle yet"
              description="Set the start date, end date and daily profit target. Each day's result comes from the sales you record on the Investments page."
              action={
                <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setDialog({ kind: 'start', latest: null })}>
                  Start your first cycle
                </Button>
              }
            />
          </div>
        )}
      </PortfolioGate>
      <CycleDialog
        mode={dialog}
        onClose={() => setDialog(null)}
        onDelete={() => {
          if (dialog?.kind === 'edit') setDeleting(dialog.cycle)
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this trading cycle?"
        message={
          deleting ? (
            <>
              The cycle {formatDate(deleting.startDate)} – {formatDate(cycleEndDate(deleting))} and its settings will be deleted. Your trades on the
              Investments page are not changed. If it had ended the previous cycle early, that cycle is reopened.
            </>
          ) : null
        }
        confirmLabel="Delete cycle"
        destructive
        loading={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
