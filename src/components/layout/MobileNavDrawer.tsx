import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Download, Loader2, LogOut, RefreshCw, Upload, UserCircle2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useModal } from '@/hooks/useModal'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AppBrand, DISCLAIMER } from './AppSidebar'
import { SectionNav } from './SectionNav'

export const MOBILE_NAV_ID = 'mobile-nav-drawer'

export interface MobileNavDrawerProps {
  open: boolean
  onClose: () => void
  email: string | null
  onRefreshPrices: () => void
  pricesRefreshing: boolean
  onImport: () => void
  importDisabled: boolean
  onExport: () => void
  exporting: boolean
  exportDisabled: boolean
  onSignOut: () => void
}

/** A full-width row button in the drawer, styled like a navigation item. */
function DrawerAction({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 pointer-coarse:py-2.5"
    >
      {icon}
      {label}
    </button>
  )
}

/**
 * Navigation on phones and tablets (< lg), opened from the header's menu button: the pages,
 * the portfolio actions (refresh, import, export), theme and account. Slides in from the left;
 * closes on a page link, the backdrop, the × button or Esc, and returns focus to the menu button.
 */
export function MobileNavDrawer(props: MobileNavDrawerProps) {
  const { open, onClose } = props
  const panelRef = useRef<HTMLDivElement>(null)
  useModal(open, panelRef, onClose)

  if (!open) return null

  // Run an action after closing, so its own dialog (file picker, import preview) isn't behind the drawer.
  const then = (action: () => void) => () => {
    onClose()
    action()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-overlay motion-reduce:animate-none" aria-hidden onClick={onClose} />
      <div
        id={MOBILE_NAV_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-popover',
          'animate-drawer-in motion-reduce:animate-none',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
          <AppBrand />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            data-autofocus
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-3 py-4">
          <SectionNav onNavigate={onClose} />

          <section aria-labelledby="drawer-data-h" className="flex flex-col gap-0.5">
            <h2 id="drawer-data-h" className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Portfolio data
            </h2>
            <DrawerAction
              icon={<RefreshCw className={cn('h-4 w-4 text-muted-foreground', props.pricesRefreshing && 'animate-spin')} aria-hidden />}
              label="Refresh prices"
              onClick={then(props.onRefreshPrices)}
              disabled={props.pricesRefreshing}
            />
            <DrawerAction
              icon={<Upload className="h-4 w-4 text-muted-foreground" aria-hidden />}
              label="Import from Excel"
              onClick={then(props.onImport)}
              disabled={props.importDisabled}
            />
            <DrawerAction
              icon={
                props.exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
                ) : (
                  <Download className="h-4 w-4 text-muted-foreground" aria-hidden />
                )
              }
              label="Export to Excel"
              onClick={then(props.onExport)}
              disabled={props.exportDisabled || props.exporting}
            />
          </section>
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          <div className="flex items-center justify-between gap-2 px-2.5">
            <span className="text-sm font-medium text-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-2.5 px-2.5">
            <UserCircle2 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={props.email ?? undefined}>
              {props.email}
            </span>
          </div>
          <DrawerAction icon={<LogOut className="h-4 w-4 text-muted-foreground" aria-hidden />} label="Log out" onClick={then(props.onSignOut)} />
          <p className="px-2.5 text-[11px] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
