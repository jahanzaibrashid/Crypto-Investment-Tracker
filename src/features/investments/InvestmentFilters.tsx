import { useId, useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { cn } from '@/lib/cn'
import { formatDate, parseDate } from '@/lib/formatters'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { Select } from '@/components/ui/Select'
import {
  hasActiveFilters,
  EMPTY_FILTERS,
  NO_EXCHANGE,
  soldPeriodOptions,
  soldPeriodRange,
  type InvestmentFilterState,
  type SoldPeriod,
  type StatusFilter,
} from './investments.filters'
import { usedExchanges } from './exchanges'
import type { LotMetrics, PositionKind } from './investments.utils'

const STATUS_OPTIONS: { value: PositionKind; label: string }[] = [
  { value: 'HOLDING', label: 'Holding' },
  { value: 'LONG_TERM', label: 'Long-term holding' },
  { value: 'SOLD_PROFIT', label: 'Sold in profit' },
  { value: 'SOLD_LOSS', label: 'Sold in loss' },
]

interface InvestmentFiltersProps {
  value: InvestmentFilterState
  onChange: (next: InvestmentFilterState) => void
  resultCount: number
  totalCount: number
  /** All investments (not just the filtered ones): the "Sold in" months start at the earliest sale. */
  lots: LotMetrics[]
}

export function InvestmentFilters({ value, onChange, resultCount, totalCount, lots }: InvestmentFiltersProps) {
  const set = <K extends keyof InvestmentFilterState>(key: K, v: InvestmentFilterState[K]) => onChange({ ...value, [key]: v })
  const active = hasActiveFilters(value)
  const periodOptions = useMemo(() => soldPeriodOptions(lots), [lots])
  // Only exchanges actually used, plus "Not set" when some investments have none.
  const exchangeFilterOptions = useMemo(() => {
    const used = usedExchanges(lots.map((l) => l.investment))
    const anyUnset = lots.some((l) => !l.investment.exchange)
    return [
      { value: '', label: 'All platforms' },
      ...used.map((name) => ({ value: name, label: name })),
      ...(anyUnset ? [{ value: NO_EXCHANGE, label: 'Not set' }] : []),
    ]
  }, [lots])
  const soldRange = soldPeriodRange(value.soldIn)

  // Phones: the fields are collapsed behind a "Filters" button; applied filters show as removable chips.
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const label = (options: { value: string; label: string }[], v: string) => options.find((o) => o.value === v)?.label ?? v
  const chips = [
    ...value.status.map((s) => ({ key: `status-${s}`, text: label(STATUS_OPTIONS, s), clear: () => set('status', value.status.filter((x) => x !== s)) })),
    value.soldIn !== '' && { key: 'soldIn', text: `Sold: ${label(periodOptions, value.soldIn)}`, clear: () => set('soldIn', '') },
    value.exchange !== '' && { key: 'exchange', text: label(exchangeFilterOptions, value.exchange), clear: () => set('exchange', '') },
    value.from !== '' && { key: 'from', text: `From ${formatDate(value.from)}`, clear: () => set('from', '') },
    value.to !== '' && { key: 'to', text: `To ${formatDate(value.to)}`, clear: () => set('to', '') },
  ].filter((c): c is { key: string; text: string; clear: () => void } => Boolean(c))

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filter investments">
      <div className="flex items-center gap-2 md:hidden">
        <Button
          variant="secondary"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          icon={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
        >
          Filters
          {chips.length > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-solid px-1.5 text-[11px] font-semibold text-primary-foreground">
              {chips.length}
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
        </Button>
        {active && (
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            Clear all
          </Button>
        )}
      </div>
      {!open && chips.length > 0 && (
        <ul className="-mt-1 flex flex-wrap gap-1.5 md:hidden" aria-label="Applied filters">
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                onClick={c.clear}
                aria-label={`Remove filter: ${c.text}`}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/8 py-1 pr-1.5 pl-2.5 text-xs font-medium text-primary-text hover:bg-primary/15"
              >
                {c.text}
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        id={panelId}
        className={cn(
          'grid-cols-2 gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end',
          open ? 'grid' : 'hidden',
        )}
      >
        <MultiSelect
          label="Status"
          value={value.status}
          active={value.status.length > 0}
          onChange={(next: StatusFilter) => set('status', next)}
          options={STATUS_OPTIONS}
          placeholder="All statuses"
        />
        {/* Sale period: shows only investments sold in it, so the totals row becomes that period's P/L. */}
        <Select
          label="Sold in"
          value={value.soldIn}
          active={value.soldIn !== ''}
          onChange={(e) => set('soldIn', e.target.value as SoldPeriod)}
          options={periodOptions}
        />
        <Select
          label="Bought on"
          value={value.exchange}
          active={value.exchange !== ''}
          onChange={(e) => set('exchange', e.target.value)}
          options={exchangeFilterOptions}
        />
        {/* An unreadable typed date clears that bound instead of filtering on garbage. */}
        <DateInput label="Bought from" hint={null} value={value.from} active={value.from !== ''} max={value.to || undefined} onChange={(v) => set('from', parseDate(v) ?? '')} />
        <DateInput label="Bought to" hint={null} value={value.to} active={value.to !== ''} min={value.from || undefined} onChange={(v) => set('to', parseDate(v) ?? '')} />
        <Button
          variant="ghost"
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={!active}
          icon={<X className="h-4 w-4" aria-hidden />}
          className="col-span-2 justify-center md:col-span-1"
        >
          Clear filters
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {active ? `Showing ${resultCount} of ${totalCount} investments` : `${totalCount} investment${totalCount === 1 ? '' : 's'}`}
        {soldRange && ` · Sold from ${formatDate(soldRange.from)} to ${formatDate(soldRange.to)}`}
        {' · '}Portfolio totals always include every investment.
      </p>
    </div>
  )
}
