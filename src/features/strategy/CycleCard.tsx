import { useId, useState } from 'react'
import { ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PLValue } from '@/components/ui/PLValue'
import { cn } from '@/lib/cn'
import { formatDate, formatPercent } from '@/lib/formatters'
import { CycleBar, CycleStats } from './CycleOverview'
import { TrackerTable } from './TrackerTable'
import { CycleRecovery } from './CycleRecovery'
import type { CycleProgress } from './strategy.utils'

const STATUS = { upcoming: { label: 'Not started', tone: 'info' }, active: { label: 'Active', tone: 'positive' }, ended: { label: 'Ended', tone: 'neutral' } } as const

/**
 * One trading cycle, collapsed to a single row (dates, status, result) with Edit and Delete.
 * Clicking the row opens its progress, stats, daily log and loss recovery calculator.
 */
export function CycleCard({ progress: p, onEdit, onDelete }: { progress: CycleProgress; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const s = STATUS[p.status]

  return (
    <section className="surface-card" aria-label={`Trading cycle ${formatDate(p.cycle.startDate)} – ${formatDate(p.endDate)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
          <span className="tabular text-sm font-semibold text-foreground">
            {formatDate(p.cycle.startDate)} – {formatDate(p.endDate)}
          </span>
          <Badge tone={s.tone}>{s.label}</Badge>
          {/* Phones: on its own line under the dates, lined up after the chevron. */}
          <span className="tabular flex w-full flex-wrap items-center gap-x-1 pl-7 text-xs text-muted-foreground sm:w-auto sm:pl-0">
            Realized <PLValue value={p.realizedPL} format="amount" icon={false} /> · {formatPercent(p.progressPct, { signed: false })} of target · {p.totalDays} days
          </span>
        </button>
        <span className="ml-auto flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" aria-hidden />} onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive-text" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={onDelete}>
            Delete
          </Button>
        </span>
      </div>

      {open && (
        <div id={bodyId} className="flex flex-col gap-3 border-t border-border p-3 sm:p-4">
          <CycleBar progress={p} />
          <CycleStats progress={p} />
          <TrackerTable progress={p} />
          <CycleRecovery progress={p} />
        </div>
      )}
    </section>
  )
}
