import { useId, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatShortDate, parseShortDate } from '@/lib/formatters'
import { controlBorder, controlClass } from './control'
import { FieldShell } from './Input'

interface DateInputProps {
  label: string
  /** YYYY-MM-DD (or the raw text the user typed if it could not be parsed — validation reports it). */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  min?: string
  max?: string
}

/**
 * Date field that displays and accepts the app's short format ("1-Sep-26"), unlike the
 * native date input whose format is fixed by the browser locale. Typing also accepts
 * "1-Sep-2026" and "2026-09-01"; the 📅 button opens the browser's calendar picker.
 */
export function DateInput({ label, value, onChange, onBlur, error, min, max }: DateInputProps) {
  const id = useId()
  const nativeRef = useRef<HTMLInputElement>(null)
  const display = (v: string) => (parseShortDate(v) ? formatShortDate(v) : v)
  const [text, setText] = useState(() => display(value))
  const [synced, setSynced] = useState(value)
  // Value changed from outside (calendar pick, form reset): show it in short format.
  if (value !== synced) {
    setSynced(value)
    setText(display(value))
  }

  const commit = () => {
    const iso = parseShortDate(text)
    const next = iso ?? text.trim()
    setSynced(next)
    if (iso) setText(formatShortDate(iso))
    onChange(next)
    onBlur?.()
  }

  const openPicker = () => {
    const el = nativeRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
      el.click()
    }
  }

  return (
    <FieldShell id={id} label={label} error={error} hint={error ? undefined : 'Format: 1-Sep-26'}>
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder="e.g. 1-Sep-26"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={cn(controlClass, 'h-9 pr-10', controlBorder(error))}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label={`Open calendar for ${label}`}
          className="absolute inset-y-0 right-1 my-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4" aria-hidden />
        </button>
        {/* Native picker, kept off-screen; only opened via the button. */}
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          value={parseShortDate(value) ?? ''}
          min={min}
          max={max}
          onChange={(e) => {
            if (!e.target.value) return
            onChange(e.target.value)
            // A calendar pick never focuses the text field; mark it touched so it validates now.
            onBlur?.()
          }}
          className="pointer-events-none absolute right-0 bottom-0 h-px w-px opacity-0"
        />
      </div>
    </FieldShell>
  )
}
