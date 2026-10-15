import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, LogOut, RefreshCw, UserCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { SectionNav } from './SectionNav'
import { APP_NAME } from '@/lib/constants'
import { formatRelative, formatTime } from '@/lib/formatters'
import { useNow } from '@/hooks/useNow'

export interface AppHeaderProps {
  email: string | null
  lastPriceUpdate: number | null
  pricesStale: boolean
  pricesRefreshing: boolean
  priceError: string | null
  onRefreshPrices: () => void
  onExport: () => void
  exporting: boolean
  exportDisabled: boolean
  onSignOut: () => void
}

function AccountMenu({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        icon={<UserCircle2 className="h-5 w-5" aria-hidden />}
      >
        <span className="hidden max-w-40 truncate md:inline">{email}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-popover">
          <div className="truncate px-3 py-2 text-xs text-muted-foreground" title={email ?? undefined}>
            Signed in as
            <br />
            <span className="text-foreground">{email}</span>
          </div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

export function AppHeader(props: AppHeaderProps) {
  const now = useNow(15_000)
  const today = new Date(now).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

  return (
    // Phones: title on its own row and actions below it, and the header scrolls away instead of
    // pinning ~150px of the screen. From `sm` up it is one row and stays pinned.
    <header className="z-20 border-b border-border bg-card sm:sticky sm:top-0">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-6">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{APP_NAME}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={new Date(now).toISOString().slice(0, 10)}>{today}</time>
            <span aria-hidden>·</span>
            <span data-testid="price-updated">
              {props.lastPriceUpdate
                ? `Prices updated ${formatTime(props.lastPriceUpdate)} (${formatRelative(props.lastPriceUpdate, now)})`
                : 'Prices not loaded yet'}
            </span>
            {props.pricesStale && (
              <Badge tone="warning" title={props.priceError ?? 'Prices may be out of date'}>
                Stale prices
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={props.onRefreshPrices}
            disabled={props.pricesRefreshing}
            aria-label="Refresh prices"
            icon={<RefreshCw className={`h-4 w-4 ${props.pricesRefreshing ? 'animate-spin' : ''}`} aria-hidden />}
          >
            <span className="hidden md:inline">Refresh Prices</span>
          </Button>
          <Button
            variant="primary"
            onClick={props.onExport}
            loading={props.exporting}
            disabled={props.exportDisabled}
            aria-label="Export to Excel"
            icon={<Download className="h-4 w-4" aria-hidden />}
          >
            <span className="hidden md:inline">Export to Excel</span>
          </Button>
          <ThemeToggle />
          <AccountMenu email={props.email} onSignOut={props.onSignOut} />
        </div>
      </div>
      <div className="mx-auto max-w-[1600px] px-3 pb-2.5 sm:px-6 lg:hidden">
        <SectionNav variant="pills" />
      </div>
    </header>
  )
}
