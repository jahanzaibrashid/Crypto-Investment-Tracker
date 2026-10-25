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
 * Clicking an item adds that status to the filter (several can be on); clicking it again removes it.
 */
export function StatusLegend({
  lots,
  active,
  onSelect,
}: {
  lots: LotMetrics[]
  active: PositionKind[]
  onSelect: (kinds: PositionKind[]) => void
}) {
  const counts: Record<PositionKind, number> = { HOLDING: 0, LONG_TERM: 0, SOLD_PROFIT: 0, SOLD_LOSS: 0 }
  for (const l of lots) counts[positionKind(l)]++

  return (
    // Phones: one swipeable line running to the card edges (no wrapping, no "Row colors" label).
    // Larger screens: the labelled, wrapping row.
    <div
      role="group"
      aria-label="Row colors — click to filter by status"
      className="-mx-4 flex scrollbar-none items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
    >
      <span className="mr-1 hidden text-xs text-muted-foreground sm:inline">Row colors:</span>
      {KINDS.map(({ kind, label, bg, stripe }) => {
        const isActive = active.includes(kind)
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={isActive}
            aria-label={`${label}: ${counts[kind]} investment${counts[kind] === 1 ? '' : 's'}`}
            onClick={() => onSelect(isActive ? active.filter((k) => k !== kind) : [...active, kind])}
            title={isActive ? `Stop showing ${label}` : active.length ? `Also show ${label}` : `Show only ${label}`}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-muted pointer-coarse:py-1.5',
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
