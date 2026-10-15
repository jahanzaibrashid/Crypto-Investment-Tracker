import type { ReactNode } from 'react'

export function FormAlert({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls =
    tone === 'error'
      ? 'border-destructive/40 bg-destructive/10 text-foreground'
      : tone === 'success'
        ? 'border-success/40 bg-success/10 text-foreground'
        : 'border-primary/40 bg-primary/10 text-primary-text'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}
