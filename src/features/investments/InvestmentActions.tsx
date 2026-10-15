import { BadgeDollarSign, MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { formatShortDate } from '@/lib/formatters'
import type { LotMetrics } from './investments.utils'

export type InvestmentAction = 'view' | 'edit' | 'note' | 'sell' | 'delete'

/** Row actions behind a single "⋯" button. (Viewing details = clicking the row.) */
export function InvestmentActions({ lot, onAction }: { lot: LotMetrics; onAction: (action: InvestmentAction, lot: LotMetrics) => void }) {
  const label = `${lot.investment.coinName} bought ${formatShortDate(lot.investment.buyDate)}`
  const icon = 'h-4 w-4 shrink-0'
  return (
    // Clicks and key presses inside the menu must not also open the row's details
    // (React events from the portal bubble through this element).
    <div className="flex justify-start" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu
        triggerLabel={`Actions: ${label}`}
        trigger={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        items={[
          { label: 'Edit', ariaLabel: `Edit: ${label}`, icon: <Pencil className={icon} aria-hidden />, onSelect: () => onAction('edit', lot) },
          { label: 'Edit note', ariaLabel: `Edit note: ${label}`, icon: <StickyNote className={icon} aria-hidden />, onSelect: () => onAction('note', lot) },
          {
            label: 'Sell',
            ariaLabel: `Sell: ${label}`,
            icon: <BadgeDollarSign className={icon} aria-hidden />,
            onSelect: () => onAction('sell', lot),
            disabled: lot.status === 'SOLD',
            title: lot.status === 'SOLD' ? 'Already fully sold' : 'Record a full or partial sale',
          },
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
