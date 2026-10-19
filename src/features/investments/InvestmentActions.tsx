import { ArrowDown, ArrowUp, BadgeDollarSign, MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react'
import { DropdownMenu, type MenuItem } from '@/components/ui/DropdownMenu'
import { formatDate } from '@/lib/formatters'
import type { LotMetrics } from './investments.utils'

export type InvestmentAction = 'view' | 'edit' | 'note' | 'sell' | 'delete'

/**
 * Moving a row one place in the saved order, offered in the menu on phones (where the drag grip
 * is hidden). `up`/`down` are null at the ends of the list; `blockedReason` disables both.
 */
export interface RowMove {
  up: (() => void) | null
  down: (() => void) | null
  blockedReason: string | null
}

/** Row actions behind a single "⋯" button. (Viewing details = clicking the row.) */
export function InvestmentActions({
  lot,
  onAction,
  move,
}: {
  lot: LotMetrics
  onAction: (action: InvestmentAction, lot: LotMetrics) => void
  move?: RowMove | null
}) {
  const label = `${lot.investment.coinName} bought ${formatDate(lot.investment.buyDate)}`
  const icon = 'h-4 w-4 shrink-0'
  const sold = lot.status === 'SOLD'
  const moveReason = sold ? 'Sold investments are ordered by sale date' : (move?.blockedReason ?? null)
  const moveItems: MenuItem[] = move
    ? [
        {
          label: 'Move up',
          ariaLabel: `Move up: ${label}`,
          icon: <ArrowUp className={icon} aria-hidden />,
          onSelect: () => move.up?.(),
          disabled: !!moveReason || !move.up,
          title: moveReason ?? (move.up ? 'Move one place up' : 'Already at the top'),
        },
        {
          label: 'Move down',
          ariaLabel: `Move down: ${label}`,
          icon: <ArrowDown className={icon} aria-hidden />,
          onSelect: () => move.down?.(),
          disabled: !!moveReason || !move.down,
          title: moveReason ?? (move.down ? 'Move one place down' : 'Already at the bottom'),
        },
      ]
    : []
  return (
    // Clicks and key presses inside the menu must not also open the row's details
    // (React events from the portal bubble through this element).
    <div className="flex justify-start" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu
        triggerLabel={`Actions: ${label}`}
        trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        items={[
          {
            label: 'Edit',
            ariaLabel: `Edit: ${label}`,
            icon: <Pencil className={icon} aria-hidden />,
            onSelect: () => onAction('edit', lot),
          },
          {
            label: 'Edit note',
            ariaLabel: `Edit note: ${label}`,
            icon: <StickyNote className={icon} aria-hidden />,
            onSelect: () => onAction('note', lot),
          },
          {
            label: 'Sell',
            ariaLabel: `Sell: ${label}`,
            icon: <BadgeDollarSign className={icon} aria-hidden />,
            onSelect: () => onAction('sell', lot),
            disabled: lot.status === 'SOLD',
            title: lot.status === 'SOLD' ? 'Already fully sold' : 'Record a full or partial sale',
          },
          ...moveItems,
          {
            label: 'Delete',
            ariaLabel: `Delete: ${label}`,
            icon: <Trash2 className={icon} aria-hidden />,
            onSelect: () => onAction('delete', lot),
            destructive: true,
          },
        ]}
      />
    </div>
  )
}
