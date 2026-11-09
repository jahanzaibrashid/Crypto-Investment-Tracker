import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'camel' | 'violet' | 'pink' | 'teal' | 'orange'

const tones: Record<BadgeTone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  positive: 'border-success/40 bg-success/8 text-success-text',
  negative: 'border-destructive/40 bg-destructive/8 text-destructive-text',
  warning: 'border-warning/40 bg-warning/8 text-warning-text',
  info: 'border-primary/40 bg-primary/8 text-primary-text',
  camel: 'border-camel/40 bg-camel/8 text-camel-text',
  violet: 'border-violet/40 bg-violet/8 text-violet-text',
  pink: 'border-pink/40 bg-pink/8 text-pink-text',
  teal: 'border-teal/40 bg-teal/8 text-teal-text',
  orange: 'border-orange/40 bg-orange/8 text-orange-text',
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
  title,
}: {
  tone?: BadgeTone
  /** 'lg' = 12px, used inside the investments table */
  size?: 'md' | 'lg'
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        size === 'lg' ? 'px-2 py-px text-xs' : 'px-2 py-0.5 text-[11px]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
