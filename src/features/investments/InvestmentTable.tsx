import { createContext, useContext, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, ListRestart } from 'lucide-react'
import { InfoTip } from '@/components/ui/InfoTip'
import { Pagination } from '@/components/ui/Pagination'
import { PLPill } from '@/components/ui/PLPill'
import { PLValue } from '@/components/ui/PLValue'
import { cn } from '@/lib/cn'
import { TABLE_PAGE_SIZES } from '@/lib/constants'
import { formatShortDate, formatUsd } from '@/lib/formatters'
import { InvestmentActions, type InvestmentAction } from './InvestmentActions'
import { BoughtCell, CoinCell, CurrentValueCell, InvestedCell, ProfitLossCell, SoldAmountCell, ValueVsInvested } from './InvestmentCells'
import { PositionStatusBadge } from './PositionStatusBadge'
import { displayPL, permanentOrder, positionKind, saleSummary, summarizePortfolio, type LotMetrics, type PortfolioSummary } from './investments.utils'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
})

const helper = createColumnHelper<typeof features, LotMetrics>()

/** Drag bindings for the grip in a row's "#" cell; null for rows that can't be dragged. */
interface RowDrag {
  setActivatorNodeRef: (el: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  /** Why this row can't be dragged right now (a column sort is active, an order is saving), or null. */
  blockedReason: string | null
}
const RowDragContext = createContext<RowDrag | null>(null)

/** Drag only up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** ⋮⋮ grip: drag the row to any position. Sold lots are ordered by sale date and can't be dragged. */
function DragHandle({ lot }: { lot: LotMetrics }) {
  const drag = useContext(RowDragContext)
  const reason = lot.status === 'SOLD' ? 'Sold investments are ordered by sale date' : (drag?.blockedReason ?? null)
  const active = drag && !reason
  return (
    <button
      type="button"
      ref={active ? drag.setActivatorNodeRef : undefined}
      {...(active ? { ...drag.attributes, ...drag.listeners } : {})}
      aria-label={`Drag to reorder ${lot.investment.symbol} bought ${formatShortDate(lot.investment.buyDate)}`}
      title={reason ?? 'Drag to reorder'}
      disabled={!active}
      onClick={(e) => e.stopPropagation()} // don't open the row's details
      className="inline-flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25 pointer-coarse:h-8 pointer-coarse:w-7"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  )
}

type RowProps = HTMLAttributes<HTMLTableRowElement> & { 'data-row-tone': string; 'data-testid': string }

/** A row that can be dragged by its grip. The row moves with the pointer while dragging. */
function SortableRow({ id, blockedReason, rowProps, children }: { id: string; blockedReason: string | null; rowProps: RowProps; children: ReactNode }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: !!blockedReason })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 20 } : {}),
  }
  return (
    <RowDragContext.Provider value={{ setActivatorNodeRef, attributes, listeners, blockedReason }}>
      <tr ref={setNodeRef} style={style} {...rowProps} className={cn(rowProps.className, isDragging && 'opacity-90 shadow-popover')}>
        {children}
      </tr>
    </RowDragContext.Provider>
  )
}

/** Numeric sort key; undefined sorts last (unknown values). */
const n = (d: { toNumber(): number } | null) => (d === null ? undefined : d.toNumber())

function buildColumns(onAction: (a: InvestmentAction, lot: LotMetrics) => void) {
  return helper.columns([
    helper.display({
      id: 'rowNumber',
      header: '#',
      // Position in the sorted (pre-pagination) order, so numbering continues across pages.
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DragHandle lot={row.original} />
          <span className="min-w-4 text-[13px] text-muted-foreground">{row.getDisplayIndex() + 1}</span>
        </div>
      ),
    }),
    helper.accessor((l) => l.investment.coinName.toLowerCase(), {
      id: 'coin',
      header: 'Coin',
      sortFn: 'alphanumeric',
      cell: ({ row }) => <CoinCell lot={row.original} />,
    }),
    helper.accessor((l) => l.investment.buyDate, {
      id: 'buyDate',
      header: 'Bought',
      sortFn: 'alphanumeric',
      cell: ({ row }) => <BoughtCell lot={row.original} />,
    }),
    // Sorts by the figure the cell shows (excluding the fee shown underneath).
    helper.accessor((l) => l.grossPurchaseCost.toNumber(), {
      id: 'invested',
      header: 'Invested',
      cell: ({ row }) => <InvestedCell lot={row.original} />,
    }),
    helper.accessor((l) => (l.status === 'SOLD' ? undefined : n(l.currentValue)), {
      id: 'currentValue',
      header: 'Current value',
      sortUndefined: 'last',
      cell: ({ row }) => <CurrentValueCell lot={row.original} />,
    }),
    helper.accessor((l) => n(saleSummary(l)?.netProceeds ?? null), {
      id: 'soldAmount',
      header: 'Sold amount',
      sortUndefined: 'last',
      cell: ({ row }) => <SoldAmountCell lot={row.original} />,
    }),
    helper.accessor((l) => n(displayPL(l)), {
      id: 'pl',
      header: 'Profit / Loss',
      sortUndefined: 'last',
      cell: ({ row }) => <ProfitLossCell lot={row.original} />,
    }),
    helper.accessor((l) => l.status, {
      id: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => <PositionStatusBadge lot={row.original} size="lg" />,
    }),
    helper.accessor((l) => l.investment.note ?? '', {
      id: 'note',
      header: 'Note',
      enableSorting: false,
      cell: ({ row }) => {
        const note = row.original.investment.note
        return note ? (
          <p className="max-w-32 truncate text-[13px] text-muted-foreground" title={note}>
            {note}
          </p>
        ) : (
          <span className="text-[15px] text-muted-foreground">—</span>
        )
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      // Revealed on row hover / keyboard focus / while its menu is open; always visible on touch screens.
      cell: ({ row }) => (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
          <InvestmentActions lot={row.original} onAction={onAction} />
        </div>
      ),
    }),
  ])
}

/** Numeric columns: kept on one line so figures don't wrap. All columns are left-aligned. */
const NUMERIC = new Set(['buyDate', 'invested', 'soldAmount', 'currentValue', 'pl'])

/** Plain-language help shown by the ⓘ next to each column header. */
const HELP: Record<string, string> = {
  coin: 'The coin you bought: ticker symbol and full name.',
  buyDate: 'How much you bought @ the price per coin, and the date you bought it. "x left" = how much you still hold after a partial sale.',
  invested: 'Money you put in: quantity × buy price. A purchase fee is shown underneath and is included in Profit / Loss.',
  currentValue:
    'What the coins you still hold are worth right now: remaining quantity × the live CoinGecko price (shown underneath). Empty for sold positions.',
  soldAmount: 'Money you got back from selling: quantity sold × sale price, minus any sale fee. The sale price and sale date are shown underneath.',
  pl: 'Sold: what you got back − what you invested (realized). Still held: current value − invested (unrealized). The % is the return on the amount invested.',
  status: 'Holding, Long-term holding, Sold in profit or Sold in loss. Each status has its own row color — see the legend above the table.',
  note: 'Your note for this purchase. Hover to read it in full; click the row to see all details.',
}

/** Column names as shown, for the ⓘ button labels ("About Invested"). */
const HEADER_TEXT: Record<string, string> = {
  coin: 'Coin',
  buyDate: 'Bought',
  invested: 'Invested',
  currentValue: 'Current value',
  soldAmount: 'Sold amount',
  pl: 'Profit / Loss',
  status: 'Status',
  note: 'Note',
}

const SORT_LABELS: Record<string, string> = {
  coin: 'coin',
  buyDate: 'buy date',
  invested: 'investment amount',
  soldAmount: 'sold amount',
  currentValue: 'current value',
  pl: 'profit/loss',
}

/**
 * Horizontal padding: outer cells line up with the card's padding (16px / 20px ≥sm),
 * inner cells use 12px. Vertical: 8px for body rows, header and totals (compact rows).
 */
function padX(index: number, last: number) {
  return cn(index === 0 ? 'pl-4 sm:pl-5' : 'pl-3', index === last ? 'pr-4 sm:pr-5' : 'pr-3')
}

/** Totals for every row currently in the table (all pages, after filters). Stays pinned to the bottom while scrolling. */
function TotalsRow({ totals, count, columnIds }: { totals: PortfolioSummary; count: number; columnIds: string[] }) {
  const t = totals
  const gross = t.totalPurchaseCost.minus(t.totalBuyFees)
  const value = (v: ReactNode) => <div className="text-[15px] font-semibold text-foreground">{v}</div>
  const cells: Record<string, ReactNode> = {
    coin: (
      <div>
        <div className="text-[15px] font-semibold text-foreground">Total</div>
        <div className="text-[13px] text-muted-foreground">
          {count} row{count === 1 ? '' : 's'}
        </div>
      </div>
    ),
    invested: (
      <div className="flex flex-col">
        {value(formatUsd(gross))}
        {t.totalBuyFees.gt(0) && <div className="text-[13px] text-muted-foreground">+{formatUsd(t.totalBuyFees)} fees</div>}
      </div>
    ),
    currentValue: (
      <div className="flex flex-col">
        {t.openLotCount > 0 ? <ValueVsInvested value={t.currentValue} pl={t.unrealizedPL} /> : value('—')}
        {!t.isComplete && <div className="text-[13px] text-warning-text">excl. {t.missingPriceCoinIds.length} unpriced</div>}
      </div>
    ),
    soldAmount: value(t.soldLotCount + t.partiallySoldLotCount > 0 ? formatUsd(t.netSaleProceeds) : '—'),
    pl: (
      <div className="flex flex-col items-start gap-0.5">
        <PLPill value={t.totalPL} />
        <PLValue value={t.overallROI} format="percent" icon={false} className="pl-0.5 text-[13px]" />
      </div>
    ),
  }
  const last = columnIds.length - 1
  return (
    <tfoot className="tabular">
      <tr data-testid="totals-row">
        {columnIds.map((id, i) => (
          <td
            key={id}
            data-column={id}
            className={cn(
              'sticky bottom-0 z-10 border-t-2 border-primary/40 bg-background py-2 align-top',
              padX(i, last),
              NUMERIC.has(id) && 'whitespace-nowrap',
            )}
          >
            {cells[id] ?? null}
          </td>
        ))}
      </tr>
    </tfoot>
  )
}

interface InvestmentTableProps {
  lots: LotMetrics[]
  onAction: (action: InvestmentAction, lot: LotMetrics) => void
  /** A row was dropped onto another row's place: save the new order. */
  onReorder: (activeId: string, overId: string) => void
  /** A new order is being saved; dragging waits for it. */
  reordering?: boolean
}

export function InvestmentTable({ lots, onAction, onReorder, reordering = false }: InvestmentTableProps) {
  // No column sort = the permanent order (saved order for open lots, sale date for sold ones).
  // Column sorts are temporary: a third click on the header, or "Back to saved order", clears them.
  const [sorting, setSorting] = useState<SortingState>([])
  const ordered = useMemo(() => permanentOrder(lots), [lots])
  const sortedBy = sorting[0] ? (SORT_LABELS[sorting[0].id] ?? sorting[0].id) : null
  const blockedReason = sortedBy ? 'Clear sorting to reorder' : reordering ? 'Saving the new order…' : null

  // Drag by the grip; a few pixels of movement before a drag starts, so taps still work.
  // Keyboard: focus the grip, Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  // The click that ends a drag must not also open the row under the pointer.
  const lastDragEnd = useRef(0)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now()
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const totals = useMemo(() => summarizePortfolio(lots), [lots])
  // `onAction` must be stable (useCallback) so the column model is not rebuilt each render.
  const columns = useMemo(() => buildColumns(onAction), [onAction])

  const table = useTable({
    features,
    columns,
    data: ordered,
    getRowId: (l) => l.investment.id,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // `lots` gets a new identity on every price refresh, edit and sale; auto-reset would
    // send the user back to page 1 each time. Out-of-range pages are clamped below instead.
    autoResetPageIndex: false,
  })

  const { pageIndex, pageSize } = table.state.pagination
  const lastPage = Math.max(0, Math.ceil(lots.length / pageSize) - 1)
  // Rows were removed (delete, filter) and the current page no longer exists.
  if (pageIndex > lastPage) setPagination((p) => ({ ...p, pageIndex: lastPage }))
  const pager = (
    <Pagination
      pageIndex={pageIndex}
      pageCount={table.getPageCount()}
      pageSize={pageSize}
      pageSizes={TABLE_PAGE_SIZES}
      total={table.getRowCount()}
      onPageChange={(i) => table.setPageIndex(i)}
      onPageSizeChange={(s) => table.setPageSize(s)}
    />
  )

  const columnIds = table.getAllLeafColumns().map((c) => c.id)
  const last = columnIds.length - 1
  const pageRows = table.getRowModel().rows
  // Only open lots are sortable; they always come before sold ones in the saved order.
  const sortableIds = pageRows.filter((r) => r.original.status !== 'SOLD').map((r) => r.id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      onDragCancel={() => (lastDragEnd.current = Date.now())}
    >
      <div className="flex flex-col">
        {sortedBy && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground sm:px-5">
            <span>
              Temporarily sorted by <span className="font-medium text-foreground">{sortedBy}</span>. Dragging rows is paused.
            </span>
            <button
              type="button"
              onClick={() => setSorting([])}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary-text hover:bg-muted"
            >
              <ListRestart className="h-3.5 w-3.5" aria-hidden />
              Back to saved order
            </button>
          </div>
        )}
        {/* Scrolls inside the card so the header (top) and totals (bottom) stay visible.
            Same table on every screen size; phones scroll it sideways. */}
        <div className="max-h-[calc(100dvh-7rem)] min-h-96 overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[15px]" aria-label="Investments">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header, i) => {
                    const canSort = header.column.getCanSort()
                    const sorted = header.column.getIsSorted()
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                        className={cn(
                          'sticky top-0 z-10 border-y border-border bg-card py-2 text-left align-bottom text-xs leading-tight font-semibold uppercase',
                          padX(i, last),
                          sorted ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        <div className="inline-flex items-end gap-1">
                          {header.isPlaceholder ? null : canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-end gap-1 rounded text-left uppercase hover:text-foreground"
                              aria-label={`Sort by ${SORT_LABELS[header.column.id] ?? header.column.id}`}
                            >
                              <span className="max-w-[5rem]">
                                <table.FlexRender header={header} />
                              </span>
                              {sorted === 'asc' ? (
                                <ArrowUp className="h-3 w-3 shrink-0 text-primary-text" aria-hidden />
                              ) : sorted === 'desc' ? (
                                <ArrowDown className="h-3 w-3 shrink-0 text-primary-text" aria-hidden />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block max-w-[5rem]">
                              <table.FlexRender header={header} />
                            </span>
                          )}
                          {HELP[header.column.id] && <InfoTip label={HEADER_TEXT[header.column.id] ?? header.column.id} text={HELP[header.column.id]!} />}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="tabular">
              <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                {pageRows.map((row) => {
                  const lot = row.original
                  const rowProps: RowProps = {
                    tabIndex: 0,
                    title: 'Click to view details',
                    'aria-label': `${lot.investment.coinName} bought ${formatShortDate(lot.investment.buyDate)} — press Enter to view details`,
                    onClick: () => {
                      if (Date.now() - lastDragEnd.current > 300) onAction('view', lot)
                    },
                    onKeyDown: (e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onAction('view', lot)
                      }
                    },
                    'data-row-tone': positionKind(lot),
                    className: 'group cursor-pointer align-top transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2',
                    'data-testid': 'investment-row',
                  }
                  const cells = row.getAllCells().map((cell, i) => (
                    <td
                      key={cell.id}
                      className={cn(
                        'border-b border-border py-2 text-left',
                        padX(i, last),
                        NUMERIC.has(cell.column.id) && 'whitespace-nowrap',
                        cell.column.id === 'actions' && 'py-1.5',
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </td>
                  ))
                  return lot.status === 'SOLD' ? (
                    <tr key={row.id} {...rowProps}>
                      {cells}
                    </tr>
                  ) : (
                    <SortableRow key={row.id} id={row.id} blockedReason={blockedReason} rowProps={rowProps}>
                      {cells}
                    </SortableRow>
                  )
                })}
              </SortableContext>
            </tbody>
            <TotalsRow totals={totals} count={lots.length} columnIds={columnIds} />
          </table>
        </div>
        {pager}
      </div>
    </DndContext>
  )
}
