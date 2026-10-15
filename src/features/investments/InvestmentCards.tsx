import type { ReactNode } from 'react'
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react'
import type { SortingState } from '@tanstack/react-table'
import { PLPill } from '@/components/ui/PLPill'
import { PLValue } from '@/components/ui/PLValue'
import { formatShortDate, formatUsd } from '@/lib/formatters'
import { InvestmentActions, type InvestmentAction } from './InvestmentActions'
import { BoughtCell, CoinCell, CurrentValueCell, InvestedCell, ProfitLossCell, SoldAmountCell } from './InvestmentCells'
import { PositionStatusBadge } from './PositionStatusBadge'
import { positionKind, type LotMetrics, type PortfolioSummary } from './investments.utils'

/** Must cover every sortable table column: sorting state is shared with the desktop table. */
const SORT_OPTIONS = [
  { id: 'buyDate', label: 'Buy date' },
  { id: 'coin', label: 'Coin' },
  { id: 'invested', label: 'Invested' },
  { id: 'currentValue', label: 'Current value' },
  { id: 'soldAmount', label: 'Sold amount' },
  { id: 'pl', label: 'Profit / Loss' },
]

interface InvestmentCardsProps {
  rows: LotMetrics[]
  totals: PortfolioSummary
  totalCount: number
  sorting: SortingState
  onSortingChange: (s: SortingState) => void
  onAction: (action: InvestmentAction, lot: LotMetrics) => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="text-[13px] font-semibold text-muted-foreground uppercase">{label}</div>
      {children}
    </div>
  )
}

/** Phone layout: one card per investment, driven by the same table state (sort, page, filters). */
export function InvestmentCards({ rows, totals, totalCount, sorting, onSortingChange, onAction }: InvestmentCardsProps) {
  const sort = sorting[0] ?? { id: 'buyDate', desc: true }
  const gross = totals.totalPurchaseCost.minus(totals.totalBuyFees)

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {/* Sort controls */}
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Sort by
          <select
            value={sort.id}
            onChange={(e) => onSortingChange([{ id: e.target.value, desc: sort.desc }])}
            className="h-9 rounded-lg border border-input-border bg-input px-2.5 text-sm text-foreground"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onSortingChange([{ id: sort.id, desc: !sort.desc }])}
          aria-label={sort.desc ? 'Sorted high to low — switch to low to high' : 'Sorted low to high — switch to high to low'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
        >
          {sort.desc ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden /> : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      {/* Totals summary */}
      <section
        aria-label="Totals"
        data-testid="totals-card"
        className="rounded-xl border border-border border-t-primary/40 border-t-2 bg-background p-3"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-base font-semibold text-foreground">Total</span>
          <span className="text-sm text-muted-foreground">
            {totalCount} row{totalCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Invested">
            <span className="tabular text-base font-semibold text-foreground">{formatUsd(gross)}</span>
          </Field>
          <Field label="Value / Sold">
            <span className="tabular text-base font-semibold text-foreground">{formatUsd(totals.currentValue.plus(totals.netSaleProceeds))}</span>
          </Field>
          <Field label="P / L">
            <PLPill value={totals.totalPL} size="sm" />
            <PLValue value={totals.overallROI} format="percent" icon={false} className="text-sm" />
          </Field>
        </div>
      </section>

      {/* Cards */}
      <ul className="flex flex-col gap-2.5" aria-label="Investments">
        {rows.map((lot) => (
          <li key={lot.investment.id}>
            <div
              role="button"
              tabIndex={0}
              data-testid="investment-row"
              data-row-tone={positionKind(lot)}
              aria-label={`${lot.investment.coinName} bought ${formatShortDate(lot.investment.buyDate)} — open details`}
              onClick={() => onAction('view', lot)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onAction('view', lot)
                }
              }}
              className="tabular flex cursor-pointer flex-col gap-3 rounded-xl border border-border p-3 pl-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <div className="flex items-start justify-between gap-2">
                <CoinCell lot={lot} />
                <div className="flex items-start gap-1">
                  <PositionStatusBadge lot={lot} size="lg" />
                  <InvestmentActions lot={lot} onAction={onAction} />
                </div>
              </div>
              <BoughtCell lot={lot} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invested">
                  <InvestedCell lot={lot} />
                </Field>
                {lot.status === 'SOLD' ? (
                  <Field label="Sold amount">
                    <SoldAmountCell lot={lot} />
                  </Field>
                ) : (
                  <Field label="Current value">
                    <CurrentValueCell lot={lot} />
                  </Field>
                )}
              </div>
              <Field label="Profit / Loss">
                <ProfitLossCell lot={lot} />
              </Field>
              {lot.investment.note && <p className="truncate text-sm text-muted-foreground">Note: {lot.investment.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
