import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
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
  columnOrderingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, ListRestart } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { PLPill } from '@/components/ui/PLPill'
import { PLValue } from '@/components/ui/PLValue'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { TABLE_PAGE_SIZES } from '@/lib/constants'
import { ZERO, type Dec } from '@/lib/decimal'
import { formatAmount, formatDate, formatQuantity, formatUsd } from '@/lib/formatters'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { HoldingAtSelect } from './HoldingAtSelect'
import { InvestmentActions, type InvestmentAction, type RowMove } from './InvestmentActions'
import { BoughtCell, CoinCell, CurrentValueCell, InvestedCell, ProfitLossCell, SoldAmountCell, ValueVsInvested } from './InvestmentCells'
import { PositionStatusBadge } from './PositionStatusBadge'
import { ProfitStatusSelect } from './ProfitStatusSelect'
import { tableColumnOrder, tableColumnVisibility, type ColumnPrefs } from './investments.columns'
import { activeTarget, displayPL, permanentOrder, positionKind, saleSummary, summarizePortfolio, totalsWithTargets, type LotMetrics, type PortfolioSummary } from './investments.utils'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnVisibilityFeature,
  columnOrderingFeature,
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

/**
 * Phones hide the drag grip and offer "Move up / Move down" in the row menu instead.
 * Returns a row's move actions, or null when moving is offered by dragging (larger screens).
 */
const RowMoveContext = createContext<(lotId: string) => RowMove | null>(() => null)

function ActionsCell({ lot, onAction }: { lot: LotMetrics; onAction: (a: InvestmentAction, lot: LotMetrics) => void }) {
  const moveFor = useContext(RowMoveContext)
  return <InvestmentActions lot={lot} onAction={onAction} move={moveFor(lot.investment.id)} />
}

/** Row selection (the checkbox column), owned by the page so its bulk bar can act on it. */
interface RowSelection {
  isSelected: (id: string) => boolean
  /** Shift-click selects the range from the last clicked row on this page. */
  toggle: (id: string, shiftKey: boolean) => void
  /** Header checkbox: state of the current page's rows, and select / clear them all. */
  pageState: 'all' | 'some' | 'none'
  togglePage: () => void
}
const SelectionContext = createContext<RowSelection | null>(null)

/** Exchanges and wallets offered in each open row's "Held on" dropdown. */
const ExchangeOptionsContext = createContext<readonly string[]>([])

/** Native checkbox that can also show the "some selected" (indeterminate) state. */
function Checkbox({ indeterminate = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return <input ref={ref} type="checkbox" className="h-4 w-4 cursor-pointer accent-primary-solid pointer-coarse:h-5 pointer-coarse:w-5" {...props} />
}

/** Clicks on the checkbox (or the padding around it) must not open the row's details. */
const stop = (e: SyntheticEvent) => e.stopPropagation()

function SelectHeader() {
  const sel = useContext(SelectionContext)
  if (!sel) return null
  return (
    <label className="-m-1 inline-flex cursor-pointer p-1">
      <Checkbox
        aria-label={sel.pageState === 'all' ? 'Unselect all rows on this page' : 'Select all rows on this page'}
        checked={sel.pageState === 'all'}
        indeterminate={sel.pageState === 'some'}
        onChange={sel.togglePage}
      />
    </label>
  )
}

function SelectCell({ lot }: { lot: LotMetrics }) {
  const sel = useContext(SelectionContext)
  if (!sel) return null
  const id = lot.investment.id
  return (
    <label
      className="-m-1 inline-flex cursor-pointer p-1"
      onClick={stop}
      // Shift-click would otherwise also highlight the text of the rows in between.
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault()
      }}
    >
      <Checkbox
        aria-label={`Select ${lot.investment.symbol} bought ${formatDate(lot.investment.buyDate)}`}
        checked={sel.isSelected(id)}
        onClick={(e) => {
          e.stopPropagation()
          sel.toggle(id, e.shiftKey)
        }}
        onChange={() => {}} // handled in onClick, which knows about Shift
        onKeyDown={stop}
      />
    </label>
  )
}

/**
 * "Hold status": one item per row. Open lots (bought, not fully sold) get the "Held on" dropdown — where the
 * coins are; sold lots get their Sold · Profit / Sold · Loss pill.
 */
function HoldStatusCell({ lot }: { lot: LotMetrics }) {
  const options = useContext(ExchangeOptionsContext)
  return lot.status === 'SOLD' ? <PositionStatusBadge lot={lot} size="lg" /> : <HoldingAtSelect lot={lot} options={options} />
}

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
      aria-label={`Drag to reorder ${lot.investment.symbol} bought ${formatDate(lot.investment.buyDate)}`}
      title={reason ?? 'Drag to reorder'}
      disabled={!active}
      onClick={(e) => e.stopPropagation()} // don't open the row's details
      // Hidden on phones: dragging inside a sideways-scrolling table is fiddly there; the row menu has Move up/down.
      className="inline-flex h-6 w-5 shrink-0 cursor-grab touch-none max-sm:hidden items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-25 pointer-coarse:h-8 pointer-coarse:w-7"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  )
}

type RowProps = HTMLAttributes<HTMLTableRowElement> & {
  'data-row-tone': string
  'data-selected'?: string
  'data-testid': string
}

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
      id: 'select',
      header: () => <SelectHeader />,
      cell: ({ row }) => <SelectCell lot={row.original} />,
    }),
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
    // Sorted by ticker, the text the column shows.
    helper.accessor((l) => l.investment.symbol.toLowerCase(), {
      id: 'coin',
      header: 'Coin',
      sortFn: 'alphanumeric',
      cell: ({ row }) => <CoinCell lot={row.original} />,
    }),
    // Sorts by the coin quantity the cell leads with (column id kept for saved column settings).
    helper.accessor((l) => l.quantity.toNumber(), {
      id: 'buyDate',
      header: 'Bought',
      cell: ({ row }) => <BoughtCell lot={row.original} />,
    }),
    // Sorts by the buy price the cell leads with.
    helper.accessor((l) => l.buyPrice.toNumber(), {
      id: 'invested',
      header: 'Buy at',
      cell: ({ row }) => <InvestedCell lot={row.original} />,
    }),
    helper.accessor((l) => (l.status === 'SOLD' ? undefined : n(l.currentValue)), {
      id: 'currentValue',
      header: 'Current',
      sortUndefined: 'last',
      cell: ({ row }) => <CurrentValueCell lot={row.original} />,
    }),
    // Sorts by the sale price the cell leads with. Not sold yet: the target price, when one is on.
    helper.accessor((l) => n(saleSummary(l)?.averagePrice ?? activeTarget(l)?.price ?? null), {
      id: 'soldAmount',
      header: 'Sold at',
      sortUndefined: 'last',
      cell: ({ row }) => <SoldAmountCell lot={row.original} onTarget={() => onAction('target', row.original)} />,
    }),
    helper.accessor((l) => n(activeTarget(l)?.pl ?? displayPL(l)), {
      id: 'pl',
      header: () => <Tooltip text="Profit and Loss">PnL</Tooltip>,
      sortUndefined: 'last',
      cell: ({ row }) => <ProfitLossCell lot={row.original} />,
    }),
    helper.accessor((l) => l.status, {
      id: 'status',
      header: 'Hold status',
      enableSorting: false,
      cell: ({ row }) => <HoldStatusCell lot={row.original} />,
    }),
    helper.accessor((l) => l.investment.profitStatus ?? '', {
      id: 'profitStatus',
      header: () => (
        <Tooltip text="Profit status">
          <span aria-hidden>PS</span>
          <span className="sr-only">Profit status</span>
        </Tooltip>
      ),
      enableSorting: false,
      // Only a lot sold at a profit has a profit to keep track of.
      cell: ({ row }) =>
        positionKind(row.original) === 'SOLD_PROFIT' ? <ProfitStatusSelect lot={row.original} /> : <span className="text-[15px] text-muted-foreground">—</span>,
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      // Revealed on row hover / keyboard focus / while its menu is open; always visible on touch screens.
      cell: ({ row }) => (
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
          <ActionsCell lot={row.original} onAction={onAction} />
        </div>
      ),
    }),
  ])
}

/** Columns as narrow as their content (w-px): the table's spare width goes to the other columns. */
const SHRINK = new Set(['select', 'coin'])
/** Numeric columns: kept on one line so figures don't wrap. All columns are left-aligned. */
const NUMERIC = new Set(['buyDate', 'invested', 'soldAmount', 'currentValue', 'pl'])

/** Names for the sort buttons ("Sort by investment amount"). */
const SORT_LABELS: Record<string, string> = {
  coin: 'coin',
  buyDate: 'quantity bought',
  invested: 'buy price',
  soldAmount: 'sold price',
  currentValue: 'current value',
  pl: 'profit/loss',
}

/**
 * Horizontal padding. Phones: 8px outer, 6px between columns, so more of the table fits.
 * ≥ sm: outer cells line up with the card's padding (20px), inner cells use 12px.
 * Vertical (see PAD_Y): 4px on phones, 8px ≥ sm, for body rows, header and totals.
 */
function padX(index: number, last: number) {
  return cn(index === 0 ? 'pl-2 sm:pl-5' : 'pl-1.5 sm:pl-3', index === last ? 'pr-2 sm:pr-5' : 'pr-1.5 sm:pr-3')
}

const PAD_Y = 'py-1 sm:py-2'

/** Coins per symbol across the rows: still held (open lots' remaining) and already sold. */
function coinTotals(lots: LotMetrics[]) {
  const bySymbol = new Map<string, { held: Dec; sold: Dec }>()
  for (const lot of lots) {
    const c = bySymbol.get(lot.investment.symbol) ?? { held: ZERO, sold: ZERO }
    bySymbol.set(lot.investment.symbol, {
      held: lot.status === 'HOLDING' ? c.held.plus(lot.remainingQuantity) : c.held,
      sold: c.sold.plus(lot.soldQuantity),
    })
  }
  return [...bySymbol].map(([symbol, c]) => ({ symbol, ...c }))
}

/**
 * Totals for every row currently in the table (all pages, after filters), or only for the selected rows
 * while any are ticked. Stays pinned to the bottom while scrolling.
 */
function TotalsRow({
  totals,
  lots,
  columnIds,
  selection = false,
}: {
  totals: PortfolioSummary
  lots: LotMetrics[]
  columnIds: string[]
  /** The totals cover the selected rows only. */
  selection?: boolean
}) {
  const t = totals
  const count = lots.length
  const coins = coinTotals(lots)
  const gross = t.totalPurchaseCost.minus(t.totalBuyFees)
  // Rows switched to their target count at the target here too, so the totals match the rows.
  const wt = totalsWithTargets(t, lots)
  const planned = wt.targetCount > 0
  const plannedNote = planned && (
    <div className="text-[12px] text-primary-text">
      incl. {wt.targetCount} target{wt.targetCount === 1 ? '' : 's'}
    </div>
  )
  const value = (v: ReactNode) => <div className="text-[15px] font-semibold text-foreground">{v}</div>
  const cells: Record<string, ReactNode> = {
    coin: (
      <div>
        <div className={cn('text-[15px] font-semibold', selection ? 'text-primary-text' : 'text-foreground')}>{selection ? 'Selected' : 'Total'}</div>
        <div className="text-[13px] text-muted-foreground">
          {count} row{count === 1 ? '' : 's'}
        </div>
      </div>
    ),
    buyDate: (
      <div className="flex flex-col">
        {coins.map((c) => (
          <div key={c.symbol} className="text-[13px] text-muted-foreground">
            {c.held.gt(0) && (
              <div>
                <span className="text-[15px] font-semibold text-foreground">{formatQuantity(c.held, { maxDecimals: 4 })}</span> {c.symbol} held
              </div>
            )}
            {c.sold.gt(0) && (
              <div>
                {formatQuantity(c.sold, { maxDecimals: 4 })} {c.symbol} sold
              </div>
            )}
          </div>
        ))}
      </div>
    ),
    invested: (
      <div className="flex flex-col">
        {value(formatAmount(gross))}
        {t.totalBuyFees.gt(0) && <div className="text-[13px] text-muted-foreground">+{formatUsd(t.totalBuyFees)} fees</div>}
      </div>
    ),
    currentValue: (
      <div className="flex flex-col">
        {t.openLotCount > 0 ? <ValueVsInvested value={t.currentValue} pl={t.unrealizedPL} /> : value('—')}
        {!t.isComplete && <div className="text-[13px] text-warning-text">excl. {t.missingPriceCoinIds.length} unpriced</div>}
      </div>
    ),
    soldAmount: (
      <div className="flex flex-col">
        {value(t.soldLotCount + t.partiallySoldLotCount > 0 ? formatUsd(t.netSaleProceeds) : '—')}
        {planned && <div className="text-[13px] text-primary-text">+ {formatUsd(wt.targetValue)} at targets</div>}
      </div>
    ),
    pl: (
      <div className="flex flex-col items-start gap-0.5">
        <PLPill value={wt.totalPL} planned={planned} />
        <PLValue value={wt.overallROI} format="percent" icon={false} className="pl-0.5 text-[13px]" />
        {plannedNote}
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
              'sticky bottom-0 z-10 border-t-2 border-primary/40 bg-background align-middle',
              PAD_Y,
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
  /** Shown columns and their order (saved in this browser). */
  columnPrefs: ColumnPrefs
  /** Ids of the selected rows (checkbox column). */
  selectedIds: ReadonlySet<string>
  onSelectionChange: (next: Set<string>) => void
  /** Exchanges and wallets for the "Held on" dropdowns. */
  exchangeOptions: readonly string[]
}

export function InvestmentTable({
  lots,
  onAction,
  onReorder,
  reordering = false,
  columnPrefs,
  selectedIds,
  onSelectionChange,
  exchangeOptions,
}: InvestmentTableProps) {
  // Shown columns and their order (the "Columns" menu).
  const columnOrder = useMemo(() => tableColumnOrder(columnPrefs), [columnPrefs])
  const columnVisibility = useMemo(() => tableColumnVisibility(columnPrefs), [columnPrefs])
  // No column sort = the permanent order (saved order for open lots, sale date for sold ones).
  // Column sorts are temporary: a third click on the header, or "Back to saved order", clears them.
  const [sorting, setSorting] = useState<SortingState>([])
  const ordered = useMemo(() => permanentOrder(lots), [lots])
  const sortedBy = sorting[0] ? (SORT_LABELS[sorting[0].id] ?? sorting[0].id) : null
  const blockedReason = sortedBy ? 'Clear sorting to reorder' : reordering ? 'Saving the new order…' : null

  // Phones: Move up/down in the row menu swaps a row with its open neighbour in the saved order
  // (the same reorder a drag onto that row would make).
  const phone = useMediaQuery('(max-width: 639.98px)')
  const openIds = useMemo(() => (phone ? ordered.filter((l) => l.status !== 'SOLD').map((l) => l.investment.id) : null), [phone, ordered])
  const moveFor = (lotId: string): RowMove | null => {
    if (!openIds) return null
    const i = openIds.indexOf(lotId)
    const prev = i > 0 ? openIds[i - 1]! : null
    const next = i >= 0 && i < openIds.length - 1 ? openIds[i + 1]! : null
    return {
      up: prev ? () => onReorder(lotId, prev) : null,
      down: next ? () => onReorder(lotId, next) : null,
      blockedReason,
    }
  }

  // Drag by the grip; a few pixels of movement before a drag starts, so taps still work.
  // Keyboard: focus the grip, Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  // The click that ends a drag must not also open the row under the pointer.
  const lastDragEnd = useRef(0)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd.current = Date.now()
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })
  // With rows ticked, the totals row adds up only those rows.
  const totalsLots = useMemo(() => (selectedIds.size > 0 ? lots.filter((l) => selectedIds.has(l.investment.id)) : lots), [lots, selectedIds])
  const totals = useMemo(() => summarizePortfolio(totalsLots), [totalsLots])
  // `onAction` must be stable (useCallback) so the column model is not rebuilt each render.
  const columns = useMemo(() => buildColumns(onAction), [onAction])

  const table = useTable({
    features,
    columns,
    data: ordered,
    getRowId: (l) => l.investment.id,
    state: { sorting, pagination, columnOrder, columnVisibility },
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

  // A sort on a column that was just hidden would be invisible: drop it.
  if (sorting[0] && columnVisibility[sorting[0].id] === false) setSorting([])
  const columnIds = table.getVisibleLeafColumns().map((c) => c.id)
  const last = columnIds.length - 1
  const pageRows = table.getRowModel().rows
  // Only open lots are sortable; they always come before sold ones in the saved order.
  const sortableIds = pageRows.filter((r) => r.original.status !== 'SOLD').map((r) => r.id)

  // Checkbox column. Shift-click selects (or clears) the range from the last clicked row on this page.
  const pageIds = pageRows.map((r) => r.id)
  const lastClicked = useRef<string | null>(null)
  const pageSelected = pageIds.filter((id) => selectedIds.has(id)).length
  const selection: RowSelection = {
    isSelected: (id) => selectedIds.has(id),
    toggle: (id, shiftKey) => {
      const next = new Set(selectedIds)
      const on = !selectedIds.has(id)
      const from = lastClicked.current ? pageIds.indexOf(lastClicked.current) : -1
      const to = pageIds.indexOf(id)
      const range = shiftKey && from >= 0 && to >= 0 ? pageIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
      for (const r of range) {
        if (on) next.add(r)
        else next.delete(r)
      }
      lastClicked.current = id
      onSelectionChange(next)
    },
    pageState: pageSelected === 0 ? 'none' : pageSelected === pageIds.length ? 'all' : 'some',
    togglePage: () => {
      const next = new Set(selectedIds)
      const allOn = pageSelected === pageIds.length
      for (const id of pageIds) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      onSelectionChange(next)
    },
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      onDragCancel={() => (lastDragEnd.current = Date.now())}
    >
      <RowMoveContext.Provider value={moveFor}>
        <SelectionContext.Provider value={selection}>
          <ExchangeOptionsContext.Provider value={exchangeOptions}>
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
                                'sticky top-0 z-10 border-y border-border bg-card text-left align-bottom text-xs leading-tight font-semibold uppercase',
                                PAD_Y,
                                padX(i, last),
                                SHRINK.has(header.column.id) && 'w-px',
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
                                    {/* Headers are upper case, except "PnL". */}
                                    <span className={cn('max-w-[5rem]', header.column.id === 'pl' && 'normal-case')}>
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
                          'aria-label': `${lot.investment.coinName} bought ${formatDate(lot.investment.buyDate)}${lot.investment.exchange && lot.status !== 'SOLD' ? `, held on ${lot.investment.exchange}` : ''} — press Enter to view details`,
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
                          'data-selected': selectedIds.has(row.id) ? '' : undefined,
                          className: 'group cursor-pointer align-middle transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2',
                          'data-testid': 'investment-row',
                        }
                        const cells = row.getVisibleCells().map((cell, i) => (
                          <td
                            key={cell.id}
                            className={cn(
                              'border-b border-border text-left',
                              padX(i, last),
                              NUMERIC.has(cell.column.id) && 'whitespace-nowrap',
                              SHRINK.has(cell.column.id) && 'w-px',
                              cell.column.id === 'actions' ? 'py-0.5 sm:py-1.5' : PAD_Y,
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
                  <TotalsRow totals={totals} lots={totalsLots} columnIds={columnIds} selection={selectedIds.size > 0} />
                </table>
              </div>
              {pager}
            </div>
          </ExchangeOptionsContext.Provider>
        </SelectionContext.Provider>
      </RowMoveContext.Provider>
    </DndContext>
  )
}
