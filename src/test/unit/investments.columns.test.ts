import { describe, expect, it } from 'vitest'
import { DEFAULT_COLUMN_PREFS, parseColumnPrefs } from '@/features/investments/investments.columns'

describe('parseColumnPrefs', () => {
  it('gives Profit status the saved place of the Note column it replaced', () => {
    const prefs = parseColumnPrefs(JSON.stringify({ order: ['note', 'buyDate'], hidden: [] }))
    expect(prefs.order.slice(0, 2)).toEqual(['profitStatus', 'buyDate'])
    expect(prefs.order).toHaveLength(DEFAULT_COLUMN_PREFS.order.length)
    expect(new Set(prefs.order).size).toBe(prefs.order.length)
  })
})
