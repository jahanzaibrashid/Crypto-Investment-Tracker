import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Dec } from '@/lib/decimal'
import { formatPercent, formatUsd, plClass } from '@/lib/formatters'

/**
 * A profit/loss figure. Direction is conveyed three ways — sign (+/−), arrow icon and
 * color — so it never depends on color alone.
 */
export function PLValue({
  value,
  format = 'usd',
  icon = true,
  className,
  iconClassName = 'h-3.5 w-3.5',
  suffix,
}: {
  value: Dec | null
  format?: 'usd' | 'percent'
  icon?: boolean
  className?: string
  /** Arrow size (defaults to 14px). */
  iconClassName?: string
  suffix?: string
}) {
  if (value === null) return <span className={cn('text-muted-foreground', className)}>—</span>
  const Icon = value.isZero() ? Minus : value.gt(0) ? ArrowUpRight : ArrowDownRight
  const text = format === 'usd' ? formatUsd(value, { signed: true }) : formatPercent(value)
  return (
    <span className={cn('tabular inline-flex items-center gap-0.5 whitespace-nowrap', plClass(value), className)}>
      {icon && <Icon className={cn('shrink-0', iconClassName)} aria-hidden />}
      {text}
      {suffix && <span className="ml-1">{suffix}</span>}
    </span>
  )
}
