import { cn } from '@/lib/cn'
import { POSITION_KIND_LABEL, positionKind, type LotMetrics, type PositionKind } from './investments.utils'

const KINDS: { kind: PositionKind; label: string; bg: string; stripe: string }[] = [
  { kind: 'HOLDING', label: 'Holding', bg: 'var(--row-holding)', stripe: 'var(--primary)' },
  { kind: 'LONG_TERM', label: 'Long-term', bg: 'var(--row-long-term)', stripe: 'var(--long-term)' },
  { kind: 'SOLD_PROFIT', label: POSITION_KIND_LABEL.SOLD_PROFIT, bg: 'var(--row-profit)', stripe: 'var(--success)' },
  { kind: 'SOLD_LOSS', label: POSITION_KIND_LABEL.SOLD_LOSS, bg: 'var(--row-loss)', stripe: 'var(--destructive)' },
]

/**
 * Key for the row colors, with a count per status (across all investments).
 * Clicking an item filters the table to that status; clicking it again clears the filter.
 */
export function StatusLegend({
  lots,
  active,
  onSelect,
}: {
  lots: LotMetrics[]
  active: PositionKind | 'ALL'
  onSelect: (kind: PositionKind | 'ALL') => void
}) {
  const counts: Record<PositionKind, number> = { HOLDING: 0, LONG_TERM: 0, SOLD_PROFIT: 0, SOLD_LOSS: 0 }
  for (const l of lots) counts[positionKind(l)]++

  return (
    <div role="group" aria-label="Row colors — click to filter by status" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-muted-foreground">Row colors:</span>
      {KINDS.map(({ kind, label, bg, stripe }) => {
        const isActive = active === kind
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={isActive}
            aria-label={`${label}: ${counts[kind]} investment${counts[kind] === 1 ? '' : 's'}`}
            onClick={() => onSelect(isActive ? 'ALL' : kind)}
            title={isActive ? 'Show all statuses' : `Show only ${label}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted',
              isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border',
            )}
          >
            <span
              aria-hidden
              className="h-3 w-4 rounded-sm"
              style={{ backgroundColor: bg, boxShadow: `inset 3px 0 0 ${stripe}`, outline: '1px solid var(--border)' }}
            />
            {label}
            <span className="tabular text-muted-foreground">{counts[kind]}</span>
          </button>
        )
      })}
    </div>
  )
}
