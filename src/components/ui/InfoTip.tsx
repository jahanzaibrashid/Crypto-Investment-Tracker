import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

const WIDTH = 240

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
    const left = Math.max(8, Math.min(r.left + r.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8))
    setPos({ top: r.bottom + 6, left })
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground normal-case hover:text-foreground"
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
            className="z-50 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed font-normal text-popover-foreground normal-case shadow-popover"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
