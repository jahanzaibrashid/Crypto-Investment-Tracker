import { Loader2 } from 'lucide-react'

export function LoadingState({ label = 'Loading…', fullScreen = false }: { label?: string; fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        fullScreen
          ? 'flex min-h-screen items-center justify-center gap-3 text-sm text-muted-foreground'
          : 'flex items-center justify-center gap-3 py-12 text-sm text-muted-foreground'
      }
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary-text" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} aria-hidden />
}
