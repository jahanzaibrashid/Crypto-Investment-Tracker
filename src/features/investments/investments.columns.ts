/**
 * Which Investments-table columns are shown, and in what order. Saved in this browser (localStorage),
 * per user, so each device keeps its own layout.
 *
 * Fixed columns stay where they are and can't be hidden: "#" (row number + drag grip) and Coin at the
 * start, the actions menu at the end. Everything in between can be hidden and reordered.
 */
import { useCallback, useState } from 'react'
import { useUserId } from '@/features/auth/auth.context'

/** Movable columns, in their default order. */
export const MOVABLE_COLUMNS = [
  { id: 'buyDate', label: 'Bought' },
  { id: 'invested', label: 'Buy at' },
  { id: 'currentValue', label: 'Current' },
  { id: 'soldAmount', label: 'Sold at' },
  { id: 'pl', label: 'PnL' },
  { id: 'status', label: 'Status' },
  { id: 'profitStatus', label: 'Profit status (PS)' },
] as const

export type MovableColumnId = (typeof MOVABLE_COLUMNS)[number]['id']

const DEFAULT_ORDER: MovableColumnId[] = MOVABLE_COLUMNS.map((c) => c.id)
const KNOWN = new Set<string>(DEFAULT_ORDER)

/** Fixed columns before and after the movable ones. */
export const LEADING_COLUMNS = ['rowNumber', 'coin'] as const
export const TRAILING_COLUMNS = ['actions'] as const

export interface ColumnPrefs {
  /** Movable columns in display order. */
  order: MovableColumnId[]
  hidden: MovableColumnId[]
}

export const DEFAULT_COLUMN_PREFS: ColumnPrefs = { order: DEFAULT_ORDER, hidden: [] }

const storageKey = (userId: string) => `investments-columns:${userId}`

/**
 * Read saved prefs, keeping only columns that still exist; columns added since they were saved
 * are appended (visible), so a new column never silently goes missing.
 */
export function parseColumnPrefs(raw: string | null): ColumnPrefs {
  if (!raw) return DEFAULT_COLUMN_PREFS
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof ColumnPrefs, unknown>>
    // Profit status replaced the Note column: it takes that column's saved place.
    const pick = (v: unknown) =>
      Array.isArray(v) ? [...new Set(v.map((id) => (id === 'note' ? 'profitStatus' : id)).filter((id): id is MovableColumnId => typeof id === 'string' && KNOWN.has(id)))] : []
    const order = pick(data.order)
    for (const id of DEFAULT_ORDER) if (!order.includes(id)) order.push(id)
    return { order, hidden: pick(data.hidden) }
  } catch {
    return DEFAULT_COLUMN_PREFS
  }
}

function read(userId: string): ColumnPrefs {
  try {
    return parseColumnPrefs(localStorage.getItem(storageKey(userId)))
  } catch {
    return DEFAULT_COLUMN_PREFS
  }
}

export function useColumnPrefs() {
  const userId = useUserId()
  const [prefs, setPrefsState] = useState<ColumnPrefs>(() => read(userId))

  const setPrefs = useCallback(
    (next: ColumnPrefs) => {
      setPrefsState(next)
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next))
      } catch {
        // storage unavailable (private mode): the layout still applies for this visit
      }
    },
    [userId],
  )
  const reset = useCallback(() => {
    setPrefsState(DEFAULT_COLUMN_PREFS)
    try {
      localStorage.removeItem(storageKey(userId))
    } catch {
      // ignore
    }
  }, [userId])

  return { prefs, setPrefs, reset }
}

/** Full column order for the table: fixed leading columns, the movable ones, then the fixed trailing ones. */
export function tableColumnOrder(prefs: ColumnPrefs): string[] {
  return [...LEADING_COLUMNS, ...prefs.order, ...TRAILING_COLUMNS]
}

/** Visibility for the table: hidden movable columns set to false. */
export function tableColumnVisibility(prefs: ColumnPrefs): Record<string, boolean> {
  return Object.fromEntries(prefs.hidden.map((id) => [id, false]))
}
