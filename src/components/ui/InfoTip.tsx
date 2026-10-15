import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

const WIDTH = 240

/** True for keyboard focus; false for focus caused by a tap or click. */
function isFocusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true // selector unsupported: keep the previous behavior (open on any focus)
  }
}

/**
 * Small ⓘ button with an explanatory tooltip. Opens on hover, keyboard focus or tap;
 * closes on leave, blur, Esc or a second tap. Rendered in a portal (fixed position)
 * so it is never clipped by a scrolling table.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const width = Math.min(WIDTH, window.innerWidth - 16)
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8))
    setPos({ top: r.bottom + 6, left })
  }, [open])

  // Touch: close on a tap anywhere else (iOS doesn't focus buttons on tap, so blur never fires).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        // Hover only for a real mouse: on touch, the emulated hover would open the tip and the
        // tap's click would immediately toggle it closed again.
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
        // Same for focus: only keyboard focus opens it; a tap is handled by onClick.
        onFocus={(e) => isFocusVisible(e.currentTarget) && setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground normal-case hover:text-foreground pointer-coarse:-m-1 pointer-coarse:h-6 pointer-coarse:w-6"
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH, maxWidth: 'calc(100vw - 16px)' }}
            className="z-50 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed font-normal text-popover-foreground normal-case shadow-popover"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
