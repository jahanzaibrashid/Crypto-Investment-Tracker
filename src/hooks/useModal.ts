import { useEffect, useRef, type RefObject } from 'react'

const NOT_SKIPPED = ':not([tabindex="-1"])'
const FOCUSABLE = [
  `a[href]${NOT_SKIPPED}`,
  `button:not([disabled])${NOT_SKIPPED}`,
  `input:not([disabled])${NOT_SKIPPED}`,
  `select:not([disabled])${NOT_SKIPPED}`,
  `textarea:not([disabled])${NOT_SKIPPED}`,
  `[tabindex]${NOT_SKIPPED}`,
].join(', ')

/**
 * Behaviour shared by modal surfaces (Dialog, mobile navigation drawer) while `open`:
 * focus moves inside the panel (to `[data-autofocus]` or the first focusable element) and is
 * trapped there, Esc closes (when `dismissible`), the page behind doesn't scroll, and focus
 * returns to the element that opened it.
 */
export function useModal(open: boolean, panelRef: RefObject<HTMLElement | null>, onClose: () => void, dismissible = true) {
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  })

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissibleRef.current) {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && panel) {
        const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
        if (items.length === 0) return
        const firstEl = items[0]!
        const lastEl = items[items.length - 1]!
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, panelRef])
}
