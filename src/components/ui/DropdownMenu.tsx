import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'

export interface MenuItem {
  /** Visible text. */
  label: string
  /** Accessible name; must start with the visible label (defaults to it). */
  ariaLabel?: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Hint shown as a tooltip, e.g. why an item is disabled. */
  title?: string
  destructive?: boolean
}

const MENU_WIDTH = 176
const ITEM_HEIGHT = 34

/**
 * Accessible "⋯" style menu. Rendered in a portal with fixed positioning so it is never
 * clipped by a scrolling table; opens upward when there isn't room below.
 * Keyboard: ↑/↓/Home/End to move, Enter/Space to choose, Esc or Tab to close.
 */
export function DropdownMenu({ triggerLabel, trigger, items }: { triggerLabel: string; trigger: ReactNode; items: MenuItem[] }) {
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  // Position next to the trigger (right-aligned), flipping above if needed.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const height = items.length * ITEM_HEIGHT + 8
    const below = window.innerHeight - r.bottom
    const top = below < height + 8 && r.top > height + 8 ? r.top - height - 4 : r.bottom + 4
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))
    setPos({ top, left })
  }, [open, items.length])

  // Focus the first enabled item when opening.
  useEffect(() => {
    if (open && pos) itemRefs.current[enabled[0] ?? 0]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos])

  // Close on outside click, scroll or resize.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false)
    }
    const onMove = () => close(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  const onMenuKeyDown = (e: KeyboardEvent) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    const pos = enabled.indexOf(current)
    const focusAt = (i: number) => itemRefs.current[enabled[(i + enabled.length) % enabled.length]!]?.focus()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusAt(pos + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusAt(pos - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusAt(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusAt(-1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          open && 'bg-muted text-foreground',
        )}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={triggerLabel}
            onKeyDown={onMenuKeyDown}
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
            className="z-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-popover"
          >
            {items.map((it, i) => (
              <button
                key={it.label}
                ref={(el) => {
                  itemRefs.current[i] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-label={it.ariaLabel ?? it.label}
                aria-disabled={it.disabled || undefined}
                title={it.title}
                onClick={() => {
                  if (it.disabled) return
                  close(false)
                  it.onSelect()
                }}
                className={cn(
                  'flex h-[34px] w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors focus:outline-none',
                  it.disabled
                    ? 'cursor-not-allowed text-muted-foreground opacity-60'
                    : it.destructive
                      ? 'text-destructive-text hover:bg-destructive/10 focus:bg-destructive/10'
                      : 'text-foreground hover:bg-muted focus:bg-muted',
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
