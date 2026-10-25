import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { FieldShell } from './Input'
import { controlBorder, controlClass } from './control'
import type { SelectOption } from './Select'

export interface MultiSelectProps<T extends string> {
  label: string
  options: (SelectOption & { value: T })[]
  /** Selected values; empty = nothing picked (shown as `placeholder`). */
  value: T[]
  onChange: (next: T[]) => void
  /** Trigger text when nothing is selected, e.g. "All statuses". */
  placeholder: string
  active?: boolean
}

/**
 * Select-looking button that opens a list of checkboxes. Stays open while picking;
 * closes on outside click or Esc.
 */
export function MultiSelect<T extends string>({ label, options, value, onChange, placeholder, active }: MultiSelectProps<T>) {
  const id = useId()
  const listId = `${id}-list`
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (v: T) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const selected = options.filter((o) => value.includes(o.value))
  const text = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0]!.label : `${selected.length} selected`

  return (
    <FieldShell id={id} label={label}>
      <div
        ref={rootRef}
        className="relative"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            triggerRef.current?.focus()
          }
        }}
      >
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cn(controlClass, 'flex h-9 items-center justify-between gap-2 pr-2 text-left', controlBorder(undefined, active))}
        >
          <span className="truncate">{text}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={`${label} options`}
            className="absolute top-full left-0 z-40 mt-1 w-full min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-popover"
          >
            {options.map((o) => {
              const checked = value.includes(o.value)
              return (
                <li key={o.value} role="option" aria-selected={checked}>
                  <label className="flex h-[34px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground hover:bg-muted">
                    <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(o.value)} />
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-ring/60',
                        checked ? 'border-primary-solid bg-primary-solid text-primary-foreground' : 'border-input-border bg-input',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {o.label}
                  </label>
                </li>
              )
            })}
            {value.length > 0 && (
              <li role="presentation" className="mt-1 border-t border-border pt-1">
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="flex h-[30px] w-full items-center rounded-md px-2.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Show all
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
