import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from './Button'

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying,
}: {
  title?: string
  message?: string
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-destructive/10 p-3 text-destructive-text">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {message && <p className="max-w-md text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button onClick={onRetry} loading={retrying} icon={<RotateCw className="h-4 w-4" aria-hidden />}>
          Try again
        </Button>
      )}
    </div>
  )
}
