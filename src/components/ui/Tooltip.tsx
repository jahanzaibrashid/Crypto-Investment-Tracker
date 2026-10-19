import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Small hover tooltip for a piece of text (mouse only). Rendered in a portal with fixed
 * position, like InfoTip, so it is never clipped by a scrolling table. The tooltip text is
 * not announced: put the same information in the accessible content of the trigger.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({ top: r.top - 6, left: r.left + r.width / 2 })
  }, [open])

  return (
    <>
      <span
        ref={ref}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={() => setOpen(false)}
        className="cursor-default"
      >
        {children}
      </span>
      {open &&
        createPortal(
          <div
            aria-hidden
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, transform: 'translate(-50%, -100%)' }}
            className="pointer-events-none z-50 rounded-md border border-primary bg-popover px-2 py-1 text-xs font-medium whitespace-nowrap text-popover-foreground shadow-popover"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
