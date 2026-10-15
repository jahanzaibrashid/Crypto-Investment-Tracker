import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'longTerm'

const tones: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  positive: 'border-success/40 bg-success/8 text-success-text',
  negative: 'border-destructive/40 bg-destructive/8 text-destructive-text',
  warning: 'border-warning/40 bg-warning/8 text-warning-text',
  info: 'border-primary/40 bg-primary/8 text-primary-text',
  longTerm: 'border-long-term/40 bg-long-term/8 text-long-term-text',
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
  title,
}: {
  tone?: Tone
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
