import { RefreshCw, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/Button'

/** How often an open app checks for a newly deployed version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

/**
 * Registers the service worker and, when a new version has been deployed, asks before
 * switching to it. Never reloads on its own, so an open form is not lost.
 */
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      // Long-lived tabs and installed apps otherwise only check on navigation.
      setInterval(async () => {
        if (registration.installing || !navigator.onLine) return
        const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } }).catch(() => null)
        if (res?.status === 200) await registration.update()
      }, UPDATE_CHECK_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border border-l-4 border-l-primary bg-popover px-4 py-3 text-sm text-popover-foreground shadow-popover sm:right-4 sm:left-auto"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
      <p className="flex-1">A new version of the app is available.</p>
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Update
      </Button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update notice"
        className="-m-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
