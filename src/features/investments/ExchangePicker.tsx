import { useId, useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { LIMITS } from '@/lib/constants'
import { controlBorder, controlClass } from '@/components/ui/control'
import { FieldShell } from '@/components/ui/Input'
import { normalizeExchange } from './exchanges'

interface ExchangePickerProps {
  /** Selected exchange name, or '' when not set. */
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** Names to suggest (presets + names already used), see exchangeOptions. */
  options: string[]
  error?: string
}

type Item = { kind: 'option'; name: string } | { kind: 'add'; name: string }

/**
 * "Bought on" field: pick an exchange/wallet from the list, or type a new name and choose
 * "Add …" (or just leave the field). Matching ignores case, so a typed "binance" becomes "Binance".
 */
export function ExchangePicker({ value, onChange, onBlur, options, error }: ExchangePickerProps) {
  const inputId = useId()
  const listId = useId()
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // Value changed from outside (form reset): show it.
  if (value !== synced) {
    setSynced(value)
    setText(value)
  }

  const typed = normalizeExchange(text, options)
  const q = text.trim().toLowerCase()
  const matches = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  const exact = typed !== null && options.includes(typed)
  const items: Item[] = [...matches.map((name) => ({ kind: 'option' as const, name })), ...(typed && !exact ? [{ kind: 'add' as const, name: typed }] : [])]

  const commit = (next: string | null) => {
    const v = next ?? ''
    setText(v)
    setSynced(v)
    setOpen(false)
    if (v !== value) onChange(v)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && items[active]) {
        e.preventDefault()
        commit(items[active].name)
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  const showList = open && items.length > 0

  return (
    <FieldShell id={inputId} label="Bought on (optional)" error={error} hint="Exchange or wallet, e.g. Binance or MetaMask. Type to add a new one.">
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
          autoComplete="off"
          maxLength={LIMITS.exchangeMax}
          placeholder="Select or type an exchange…"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Leaving the field keeps what was typed (as a known spelling when it matches one).
            commit(typed)
            onBlur?.()
          }}
          onKeyDown={onKeyDown}
          className={cn(controlClass, 'h-9', value ? 'pr-9' : undefined, controlBorder(error, value !== ''))}
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(null)}
            aria-label="Clear exchange"
            className="absolute inset-y-0 right-1 my-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Exchanges"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-popover"
          >
            {items.map((item, i) => (
              <li
                key={`${item.kind}-${item.name}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(item.name)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground', i === active && 'bg-muted')}
              >
                {item.kind === 'add' ? (
                  <>
                    <Plus className="h-4 w-4 text-primary-text" aria-hidden />
                    <span>
                      Add <span className="font-medium">“{item.name}”</span>
                    </span>
                  </>
                ) : (
                  <span className={cn(item.name === value && 'font-medium')}>{item.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
