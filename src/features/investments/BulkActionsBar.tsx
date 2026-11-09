import { useEffect } from 'react'
import { X } from 'lucide-react'
import { controlText } from '@/components/ui/control'
import { useToast } from '@/components/ui/toast.context'
import { cn } from '@/lib/cn'
import { PROFIT_STATUSES } from '@/lib/constants'
import { errorMessage } from '@/lib/errors'
import { useInvestmentMutations } from './investments.hooks'
import type { ProfitStatus } from './investments.types'
import { positionKind, type LotMetrics } from './investments.utils'

/** Placeholder ("pick an action") and "clear the value" choices; '' can't be used for both. */
const PICK = '__pick'
const NONE = '__none'

const rows = (n: number) => `${n} row${n === 1 ? '' : 's'}`

/**
 * Shown while rows are selected: change "Held on" (open lots) or the profit status (lots sold at a profit)
 * of every selected row at once. Each action only touches the rows it applies to.
 */
export function BulkActionsBar({
  selected,
  totalCount,
  exchangeOptions,
  onSelectAll,
  onClear,
}: {
  /** Selected rows (only those still in the table). */
  selected: LotMetrics[]
  /** Rows in the table (after filters), for "Select all". */
  totalCount: number
  exchangeOptions: readonly string[]
  onSelectAll: () => void
  onClear: () => void
}) {
  const { updateExchange, bulkProfitStatus } = useInvestmentMutations()
  const toast = useToast()

  // Esc clears the selection (unless a dialog, a menu or a text field is using the key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]')) return
      if (e.target instanceof HTMLElement && e.target.matches('input:not([type="checkbox"]), textarea, [contenteditable="true"]')) return
      onClear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClear])

  const open = selected.filter((l) => l.status !== 'SOLD')
  const profit = selected.filter((l) => positionKind(l) === 'SOLD_PROFIT')
  const busy = updateExchange.isPending || bulkProfitStatus.isPending

  const setExchange = (value: string) => {
    const exchange = value === NONE ? null : value
    const ids = open.map((l) => l.investment.id)
    updateExchange.mutate(
      { ids, exchange },
      {
        onSuccess: () => {
          toast.success(`${exchange ? `Moved ${rows(ids.length)} to ${exchange}` : `Cleared "Held on" for ${rows(ids.length)}`}.`)
          onClear()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  const setProfitStatus = (value: string) => {
    const profitStatus = value === NONE ? null : (value as ProfitStatus)
    const label = PROFIT_STATUSES.find((s) => s.value === (profitStatus ?? ''))?.label ?? 'Not selected'
    const ids = profit.map((l) => l.investment.id)
    bulkProfitStatus.mutate(
      { ids, profitStatus },
      {
        onSuccess: () => {
          toast.success(`Profit status set to ${label} on ${rows(ids.length)}.`)
          onClear()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  const selectClass = cn(
    'h-8 max-w-48 rounded-lg border border-input-border bg-input px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
    controlText,
  )

  return (
    <div
      role="region"
      aria-label="Bulk actions for selected rows"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-primary/30 bg-primary/8 px-4 py-2 text-sm sm:px-5"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground" aria-live="polite">
          {selected.length} selected
        </span>
        {selected.length < totalCount && (
          <button type="button" onClick={onSelectAll} className="rounded px-1 font-medium text-primary-text hover:underline">
            Select all {totalCount}
          </button>
        )}
      </div>

      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Held on</span>
        <select
          value={PICK}
          disabled={busy || open.length === 0}
          onChange={(e) => setExchange(e.target.value)}
          className={selectClass}
          title={open.length === 0 ? 'Only open (not sold) rows have a "Held on" place' : undefined}
        >
          <option value={PICK} disabled>
            {open.length === 0 ? 'No open rows' : `Move ${rows(open.length)} to…`}
          </option>
          {exchangeOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={NONE}>Not set</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Profit status</span>
        <select
          value={PICK}
          disabled={busy || profit.length === 0}
          onChange={(e) => setProfitStatus(e.target.value)}
          className={selectClass}
          title={profit.length === 0 ? 'Only rows sold at a profit have a profit status' : undefined}
        >
          <option value={PICK} disabled>
            {profit.length === 0 ? 'No rows sold at a profit' : `Set on ${rows(profit.length)}…`}
          </option>
          {PROFIT_STATUSES.map((s) => (
            <option key={s.value} value={s.value || NONE}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
        Clear
      </button>
    </div>
  )
}
