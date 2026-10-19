import { useMemo } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { formatDate, parseDate } from '@/lib/formatters'
import { Select } from '@/components/ui/Select'
import {
  hasActiveFilters,
  EMPTY_FILTERS,
  soldPeriodOptions,
  soldPeriodRange,
  type InvestmentFilterState,
  type SoldPeriod,
  type StatusFilter,
} from './investments.filters'
import type { LotMetrics } from './investments.utils'

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
  const soldRange = soldPeriodRange(value.soldIn)

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filter investments">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <Select
          label="Status"
          value={value.status}
          active={value.status !== 'ALL'}
          onChange={(e) => set('status', e.target.value as StatusFilter)}
          options={[
            { value: 'ALL', label: 'All statuses' },
            { value: 'HOLDING', label: 'Holding' },
            { value: 'LONG_TERM', label: 'Long-term holding' },
            { value: 'SOLD_PROFIT', label: 'Sold in profit' },
            { value: 'SOLD_LOSS', label: 'Sold in loss' },
          ]}
        />
        {/* Sale period: shows only investments sold in it, so the totals row becomes that period's P/L. */}
        <Select
          label="Sold in"
          value={value.soldIn}
          active={value.soldIn !== ''}
          onChange={(e) => set('soldIn', e.target.value as SoldPeriod)}
          options={periodOptions}
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
