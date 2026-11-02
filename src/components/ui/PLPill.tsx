import { cn } from '@/lib/cn'
import type { Dec } from '@/lib/decimal'
import { PLValue } from './PLValue'

/**
 * Profit/loss amount as a soft pill (the investments table's Profit / Loss column): tinted
 * background + arrow + signed value, at most 2 decimals and no ".00" (formatAmount).
 * Uses the same 8% tint as status badges (contrast-tested on every row color).
 * `planned`: a hypothetical figure (profit at a target price), drawn as a dashed outline instead.
 */
export function PLPill({ value, size = 'md', planned = false }: { value: Dec | null; size?: 'sm' | 'md'; planned?: boolean }) {
  const tone = planned
    ? // Not real P/L (a target price): dashed outline, no fill, so it never reads as money made.
      cn('border border-dashed bg-transparent', value === null || value.isZero() ? 'border-border text-muted-foreground' : value.gt(0) ? 'border-success/60' : 'border-destructive/60')
    : value === null || value.isZero()
      ? 'bg-muted text-muted-foreground'
      : value.gt(0)
        ? 'bg-success/8'
        : 'bg-destructive/8'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-semibold',
        size === 'md' ? 'px-2 py-px text-[15px]' : 'px-2 py-px text-sm',
        tone,
      )}
    >
      <PLValue value={value} format="amount" iconClassName="h-3.5 w-3.5" />
    </span>
  )
}
