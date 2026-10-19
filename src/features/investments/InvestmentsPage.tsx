import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Plus, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { useToast } from '@/components/ui/toast.context'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatQuantity } from '@/lib/formatters'
import { PortfolioGate } from '@/features/dashboard/DashboardLayout'
import { usePortfolio } from '@/features/dashboard/portfolio.context'
import { InvestmentDetails } from './InvestmentDetails'
import { InvestmentDialog } from './InvestmentDialog'
import { InvestmentFilters } from './InvestmentFilters'
import { InvestmentTable } from './InvestmentTable'
import { NoteDialog } from './NoteDialog'
import { SellDialog } from './SellDialog'
import { StatusLegend } from './StatusLegend'
import type { InvestmentAction } from './InvestmentActions'
import { EMPTY_FILTERS, filterLots, type InvestmentFilterState } from './investments.filters'
import { useInvestmentMutations } from './investments.hooks'
import { reorderedOpenIds, type LotMetrics } from './investments.utils'

type DialogState = { kind: 'none' } | { kind: 'add' } | { kind: 'edit' | 'view' | 'sell' | 'note' | 'delete'; id: string }

export function InvestmentsPage() {
  const { investmentsQuery, lots } = usePortfolio()
  const { remove, reorder } = useInvestmentMutations()
  const toast = useToast()
  const location = useLocation()
  const navigate = useNavigate()

  const [filters, setFilters] = useState<InvestmentFilterState>(EMPTY_FILTERS)
  const visibleLots = useMemo(() => filterLots(lots, filters), [lots, filters])

  // "Add Investment" links from other pages arrive with { openAdd: true }.
  const [dialog, setDialog] = useState<DialogState>(() =>
    (location.state as { openAdd?: boolean } | null)?.openAdd ? { kind: 'add' } : { kind: 'none' },
  )
  useEffect(() => {
    if ((location.state as { openAdd?: boolean } | null)?.openAdd) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), [])
  const { mutate: saveOrder } = reorder
  // Dropping a row computes the new order of every open lot (not just the filtered page).
  const onReorder = useCallback(
    (activeId: string, overId: string) => {
      const ids = reorderedOpenIds(lots, activeId, overId)
      if (ids) saveOrder(ids, { onError: (e) => toast.error(errorMessage(e)) })
    },
    [lots, saveOrder, toast],
  )
  const onAction = useCallback((action: InvestmentAction, lot: LotMetrics) => setDialog({ kind: action, id: lot.investment.id }), [])
  const activeLot = dialog.kind !== 'none' && dialog.kind !== 'add' ? (lots.find((l) => l.investment.id === dialog.id) ?? null) : null
  const lotFor = (kind: DialogState['kind']) => (dialog.kind === kind ? activeLot : null)
  const deleteLot = lotFor('delete')

  const confirmDelete = async () => {
    if (!deleteLot) return
    try {
      await remove.mutateAsync(deleteLot.investment.id)
      toast.success(`Deleted ${deleteLot.investment.coinName} purchase.`)
      closeDialog()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const addButton = (label: string) => (
    <Button variant="primary" onClick={() => setDialog({ kind: 'add' })} icon={<Plus className="h-4 w-4" aria-hidden />}>
      {label}
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Investments"
        description="Each row is one purchase. Sold positions show realized P/L."
        actions={addButton('Add Investment')}
      />
      <PortfolioGate>
        <section aria-label="Investments" className="surface-card">
          {investmentsQuery.isLoading ? (
            <LoadingState label="Loading investments…" />
          ) : lots.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-5 w-5" aria-hidden />}
              title="No investments yet"
              description="Add your first crypto purchase to start tracking value, profit/loss and ROI."
              action={addButton('Add your first investment')}
            />
          ) : (
            <>
              <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
                <InvestmentFilters value={filters} onChange={setFilters} resultCount={visibleLots.length} totalCount={lots.length} lots={lots} />
                <StatusLegend lots={lots} active={filters.status} onSelect={(status) => setFilters({ ...filters, status })} />
              </div>
              {visibleLots.length === 0 ? (
                <EmptyState
                  title="No investments match these filters"
                  action={
                    <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <InvestmentTable lots={visibleLots} onAction={onAction} onReorder={onReorder} reordering={reorder.isPending} />
              )}
            </>
          )}
        </section>
      </PortfolioGate>

      <InvestmentDialog open={dialog.kind === 'add' || dialog.kind === 'edit'} lot={lotFor('edit')} onClose={closeDialog} />
      <SellDialog lot={lotFor('sell')} onClose={closeDialog} />
      <InvestmentDetails lot={lotFor('view')} onClose={closeDialog} />
      <NoteDialog investment={lotFor('note')?.investment ?? null} onClose={closeDialog} />
      <ConfirmDialog
        open={deleteLot !== null}
        title="Delete this investment?"
        message={
          deleteLot && (
            <>
              This permanently deletes the {deleteLot.investment.coinName} purchase of {formatQuantity(deleteLot.quantity)}{' '}
              {deleteLot.investment.symbol} from {formatDate(deleteLot.investment.buyDate)}
              {deleteLot.sales.length > 0 ? ` and its ${deleteLot.sales.length} recorded sale(s)` : ''}. This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDialog}
      />
    </>
  )
}
