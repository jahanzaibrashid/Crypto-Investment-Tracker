import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, LogOut, Menu, RefreshCw, Upload, UserCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { MOBILE_NAV_ID } from './MobileNavDrawer'
import { APP_NAME } from '@/lib/constants'
import { formatDate, formatRelative, formatTime } from '@/lib/formatters'
import { useNow } from '@/hooks/useNow'

export interface AppHeaderProps {
  email: string | null
  lastPriceUpdate: number | null
  pricesStale: boolean
  pricesRefreshing: boolean
  priceError: string | null
  onRefreshPrices: () => void
  onImport: () => void
  importDisabled: boolean
  onExport: () => void
  exporting: boolean
  exportDisabled: boolean
  onSignOut: () => void
  /** Opens the navigation drawer (below lg). */
  onOpenMenu: () => void
  menuOpen: boolean
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
  const today = `${new Date(now).toLocaleDateString('en-US', { weekday: 'short' })}, ${formatDate(new Date(now))}`

  return (
    // One compact row, pinned on every screen size. Below lg the pages are in the drawer opened by ☰;
    // on phones the import/export/theme/account controls move into that drawer too.
    <header className="sticky top-0 z-20 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <button
          type="button"
          onClick={props.onOpenMenu}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={props.menuOpen}
          aria-controls={props.menuOpen ? MOBILE_NAV_ID : undefined}
          className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">{APP_NAME}</h1>
          <div className="flex min-w-0 items-center gap-x-2 text-xs text-muted-foreground">
            <time className="hidden shrink-0 sm:inline" dateTime={new Date(now).toISOString().slice(0, 10)}>
              {today}
            </time>
            <span className="hidden sm:inline" aria-hidden>
              ·
            </span>
            <span className="truncate" data-testid="price-updated">
              {props.lastPriceUpdate
                ? `Prices updated ${formatTime(props.lastPriceUpdate)} (${formatRelative(props.lastPriceUpdate, now)})`
                : 'Prices not loaded yet'}
            </span>
            {props.pricesStale && (
              <Badge tone="warning" className="shrink-0" title={props.priceError ?? 'Prices may be out of date'}>
                Stale prices
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            onClick={props.onRefreshPrices}
            disabled={props.pricesRefreshing}
            aria-label="Refresh prices"
            icon={<RefreshCw className={`h-4 w-4 ${props.pricesRefreshing ? 'animate-spin' : ''}`} aria-hidden />}
          >
            <span className="hidden md:inline">Refresh Prices</span>
          </Button>
          {/* Phones: these live in the drawer. */}
          <div className="hidden items-center gap-2 sm:flex">
            <Button
              variant="secondary"
              onClick={props.onImport}
              disabled={props.importDisabled}
              aria-label="Import from Excel"
              icon={<Upload className="h-4 w-4" aria-hidden />}
            >
              <span className="hidden md:inline">Import</span>
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
      </div>
    </header>
  )
}
