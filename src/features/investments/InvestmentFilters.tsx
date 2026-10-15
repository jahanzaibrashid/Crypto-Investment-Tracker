import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { hasActiveFilters, EMPTY_FILTERS, type InvestmentFilterState, type StatusFilter } from './investments.filters'

interface InvestmentFiltersProps {
  value: InvestmentFilterState
  onChange: (next: InvestmentFilterState) => void
  resultCount: number
  totalCount: number
}

export function InvestmentFilters({ value, onChange, resultCount, totalCount }: InvestmentFiltersProps) {
  const set = <K extends keyof InvestmentFilterState>(key: K, v: InvestmentFilterState[K]) => onChange({ ...value, [key]: v })
  const active = hasActiveFilters(value)

  return (
    <div className="flex flex-col gap-3" role="search" aria-label="Filter investments">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="col-span-2 md:col-span-1">
          <Input
            label="Search"
            type="search"
            placeholder="Coin name or ticker"
            leading={<Search className="h-3.5 w-3.5" aria-hidden />}
            value={value.search}
            active={value.search.trim() !== ''}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
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
        <Input label="Bought from" type="date" value={value.from} active={value.from !== ''} max={value.to || undefined} onChange={(e) => set('from', e.target.value)} />
        <Input label="Bought to" type="date" value={value.to} active={value.to !== ''} min={value.from || undefined} onChange={(e) => set('to', e.target.value)} />
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
        {' · '}Portfolio totals always include every investment.
      </p>
    </div>
  )
}
