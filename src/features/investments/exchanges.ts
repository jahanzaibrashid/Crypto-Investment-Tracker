import type { BadgeTone } from '@/components/ui/Badge'
import { EXCHANGE_PRESETS, LIMITS } from '@/lib/constants'
import type { Investment } from './investments.types'

const key = (name: string) => name.trim().toLowerCase()

/** Exchanges actually used on these investments (first spelling wins), sorted A–Z. */
export function usedExchanges(investments: Pick<Investment, 'exchange'>[]): string[] {
  const byKey = new Map<string, string>()
  for (const inv of investments) {
    const name = inv.exchange?.trim()
    if (name && !byKey.has(key(name))) byKey.set(key(name), name)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Names offered in the "Held on" picker: the presets in the order of EXCHANGE_PRESETS (reorder
 * that list to reorder the dropdown), then names the user added, A–Z. No case-insensitive
 * duplicates; the preset spelling wins.
 */
export function exchangeOptions(investments: Pick<Investment, 'exchange'>[]): string[] {
  const byKey = new Map<string, string>()
  for (const name of [...EXCHANGE_PRESETS, ...usedExchanges(investments)]) {
    if (!byKey.has(key(name))) byKey.set(key(name), name)
  }
  return [...byKey.values()]
}

/**
 * Clean up a typed name: trims and collapses spaces, cuts to the database limit, and reuses the
 * spelling of a known name that matches ignoring case ("binance" → "Binance"). Empty → null.
 */
export function normalizeExchange(text: string | null | undefined, known: readonly string[]): string | null {
  const name = (text ?? '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.exchangeMax).trim()
  if (!name) return null
  return known.find((k) => key(k) === key(name)) ?? name
}

/** A "Held on" color: the pill's Badge tone and the matching text color for its line in the dropdown. */
export interface ExchangeColor {
  badge: BadgeTone
  text: string
}

/**
 * Fixed colors for the main places. They match the Profit status colors of the same place
 * (Binance Spot = blue, MetaMask ETH = amber, BSC = teal, Matic = violet), so a wallet looks the
 * same in both columns.
 */
const FIXED_COLORS: Record<string, ExchangeColor> = {
  binance: { badge: 'info', text: 'text-primary-text' },
  'metamask eth': { badge: 'warning', text: 'text-warning-text' },
  // Teal, not camel: camel looked too close to MetaMask ETH's amber.
  'metamask bsc': { badge: 'teal', text: 'text-teal-text' },
  'metamask matic': { badge: 'violet', text: 'text-violet-text' },
  mexc: { badge: 'camel', text: 'text-camel-text' },
  okx: { badge: 'orange', text: 'text-orange-text' },
  'trust wallet': { badge: 'pink', text: 'text-pink-text' },
}

/** Any other name (other presets, names the user added) always gets the same color from this set. */
const OTHER_COLORS: ExchangeColor[] = [
  { badge: 'teal', text: 'text-teal-text' },
  { badge: 'orange', text: 'text-orange-text' },
  { badge: 'pink', text: 'text-pink-text' },
  { badge: 'violet', text: 'text-violet-text' },
  { badge: 'camel', text: 'text-camel-text' },
]

const NOT_SET_COLOR: ExchangeColor = { badge: 'neutral', text: 'text-muted-foreground' }

/** Color of a "Held on" place (case-insensitive). Not set = grey. Green and red are left to the Sold · Profit / Loss pills. */
export function exchangeColor(name: string | null | undefined): ExchangeColor {
  const k = name ? key(name) : ''
  if (!k) return NOT_SET_COLOR
  const fixed = FIXED_COLORS[k]
  if (fixed) return fixed
  let hash = 0
  for (const ch of k) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return OTHER_COLORS[hash % OTHER_COLORS.length]!
}
