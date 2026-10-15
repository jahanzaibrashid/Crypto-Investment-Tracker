import { useId, useState, type KeyboardEvent } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { COIN_SEARCH_MIN_CHARS, COMMON_COINS } from '@/lib/constants'
import { controlClass } from '@/components/ui/control'
import { useCoinSearch } from '@/features/prices/prices.hooks'
import { describeMarketDataError } from '@/features/prices/coingecko.service'
import type { CoinRef } from './investments.types'

interface CoinPickerProps {
  value: CoinRef | null
  onChange: (coin: CoinRef) => void
  error?: string
}

/**
 * Coin selector: quick picks for common coins plus a CoinGecko search
 * combobox. The canonical CoinGecko id is stored separately from the symbol,
 * and shown alongside duplicates so similarly named tokens can be told apart.
 */
export function CoinPicker({ value, onChange, error }: CoinPickerProps) {
  const inputId = useId()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const search = useCoinSearch(query)
  const results = query.trim().length >= COIN_SEARCH_MIN_CHARS ? (search.data ?? []) : []

  const symbolCounts = new Map<string, number>()
  for (const r of results) symbolCounts.set(r.symbol, (symbolCounts.get(r.symbol) ?? 0) + 1)

  const choose = (coin: CoinRef) => {
    onChange({ id: coin.id, name: coin.name, symbol: coin.symbol.toUpperCase() })
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) setOpen(true)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault()
        choose(results[active])
      }
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }

  const showList = open && query.trim().length >= COIN_SEARCH_MIN_CHARS

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <label htmlFor={inputId} className="text-xs font-medium text-foreground">
          Cryptocurrency
        </label>
        {value && (
          <span className="text-xs text-muted-foreground" data-testid="selected-coin">
            Selected: <span className="font-medium text-foreground">{value.name}</span> ({value.symbol}) ·{' '}
            <code className="text-muted-foreground">{value.id}</code>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Common coins">
        {COMMON_COINS.map((c) => {
          const selected = value?.id === c.id
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c)}
              aria-pressed={selected}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:px-3 pointer-coarse:py-1.5',
                selected
                  ? 'border-primary bg-primary/10 text-primary-text'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {selected && <Check className="h-3 w-3" aria-hidden />}
              {c.symbol}
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          autoComplete="off"
          placeholder="Search other coins (name or symbol)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={cn(controlClass, 'h-9 pl-9', error ? 'border-destructive' : 'border-input-border')}
        />
        {search.isFetching && (
          <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-popover"
          >
            {search.isError && (
              <li className="px-3 py-2 text-xs text-destructive-text" role="presentation">
                {describeMarketDataError(search.error)}
              </li>
            )}
            {!search.isError && !search.isFetching && results.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground" role="presentation">
                No coins found.
              </li>
            )}
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(r)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                  i === active ? 'bg-muted text-foreground' : 'text-foreground',
                )}
              >
                {r.thumb ? (
                  <img src={r.thumb} alt="" className="h-5 w-5 rounded-full" referrerPolicy="no-referrer" loading="lazy" />
                ) : (
                  <span className="h-5 w-5 rounded-full bg-muted" aria-hidden />
                )}
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">{r.symbol}</span>
                {(symbolCounts.get(r.symbol) ?? 0) > 1 && <code className="text-xs text-muted-foreground">{r.id}</code>}
                {r.marketCapRank !== null && <span className="ml-auto text-xs text-muted-foreground">#{r.marketCapRank}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  )
}
