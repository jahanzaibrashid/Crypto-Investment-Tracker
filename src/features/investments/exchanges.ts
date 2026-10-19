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
 * Names offered in the "Bought on" picker: the presets in the order of EXCHANGE_PRESETS (reorder
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
