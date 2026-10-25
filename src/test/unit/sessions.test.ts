import { describe, expect, it } from 'vitest'
import type { Candle } from '@/features/analyzer/binance.service'
import { analyzeSession, DEFAULT_SESSIONS, sessionWindows, zonedTimeToUtc, type SessionConfig } from '@/features/analyzer/sessions'

const M15 = 15 * 60_000
const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/** Windows of one session on one UTC date. */
function windowOn(config: SessionConfig, id: 'asia' | 'london' | 'newyork', isoDate: string) {
  const day = Date.parse(`${isoDate}T00:00:00Z`)
  const w = sessionWindows(config, day, day + 86_400_000 - 1).find((x) => x.id === id && x.start >= day && x.start < day + 86_400_000)!
  return `${hm(w.start)}-${hm(w.end)}`
}

describe('session hours and daylight saving', () => {
  it('converts local market time to UTC with each zone’s DST rules', () => {
    expect(zonedTimeToUtc(2026, 1, 15, '08:00', 'Europe/London')).toBe(Date.parse('2026-01-15T08:00:00Z'))
    expect(zonedTimeToUtc(2026, 7, 15, '08:00', 'Europe/London')).toBe(Date.parse('2026-07-15T07:00:00Z'))
    expect(zonedTimeToUtc(2026, 7, 15, '08:00', 'America/New_York')).toBe(Date.parse('2026-07-15T12:00:00Z'))
    expect(zonedTimeToUtc(2026, 1, 15, '09:00', 'Asia/Tokyo')).toBe(Date.parse('2026-01-15T00:00:00Z'))
  })

  // Clocks change on Sundays, when there are no sessions: compare the Friday before with the Monday after.
  it('London moves one hour earlier in UTC after UK clocks go forward (29 Mar 2026)', () => {
    expect(windowOn(DEFAULT_SESSIONS, 'london', '2026-03-27')).toBe('08:00-17:00')
    expect(windowOn(DEFAULT_SESSIONS, 'london', '2026-03-30')).toBe('07:00-16:00')
  })

  it('New York follows US DST (starts 8 Mar, ends 1 Nov 2026)', () => {
    expect(windowOn(DEFAULT_SESSIONS, 'newyork', '2026-03-06')).toBe('13:00-22:00')
    expect(windowOn(DEFAULT_SESSIONS, 'newyork', '2026-03-09')).toBe('12:00-21:00')
    expect(windowOn(DEFAULT_SESSIONS, 'newyork', '2026-10-30')).toBe('12:00-21:00')
    expect(windowOn(DEFAULT_SESSIONS, 'newyork', '2026-11-02')).toBe('13:00-22:00')
  })

  it('has no sessions on Saturday or Sunday', () => {
    const sat = Date.parse('2026-10-24T00:00:00Z')
    expect(sessionWindows(DEFAULT_SESSIONS, sat, sat + 2 * 86_400_000 - 1).filter((w) => w.start >= sat)).toEqual([])
    // Monday's Asia session is measured against the range since Friday's New York open.
    const mon = Date.parse('2026-10-26T00:00:00Z')
    expect(sessionWindows(DEFAULT_SESSIONS, mon, mon + 86_400_000 - 1).filter((w) => w.start >= mon).map((w) => w.id)).toEqual(['asia', 'london', 'newyork'])
  })

  it('fixed UTC mode ignores DST', () => {
    const utc: SessionConfig = { ...DEFAULT_SESSIONS, mode: 'utc' }
    expect(windowOn(utc, 'london', '2026-01-15')).toBe('08:00-17:00')
    expect(windowOn(utc, 'london', '2026-07-15')).toBe('08:00-17:00')
  })

  it('handles a session that crosses midnight', () => {
    const night: SessionConfig = { mode: 'utc', sessions: { ...DEFAULT_SESSIONS.sessions, asia: { ...DEFAULT_SESSIONS.sessions.asia, start: '22:00', end: '07:00' } } }
    const day = Date.parse('2026-01-15T00:00:00Z')
    const w = sessionWindows(night, day, day + 86_400_000).find((x) => x.id === 'asia' && x.start === Date.parse('2026-01-15T22:00:00Z'))!
    expect(w.end).toBe(Date.parse('2026-01-16T07:00:00Z'))
  })
})

// ---------------------------------------------------------------------------------------------
// Setups: 15-minute candles on 2026-01-15 (winter: Asia 00:00–09:00 UTC, London 08:00–17:00 UTC).
// The Asia range before London opens is 96–104.
// ---------------------------------------------------------------------------------------------

type Row = [high: number, low: number, close?: number, volume?: number]
const LONDON_OPEN = Date.parse('2026-01-15T08:00:00Z')

/** 48 range-bound candles (12 h) ending at London's open, then the given London candles. */
function day(london: Row[]): Candle[] {
  const pre: Row[] = Array.from({ length: 48 }, (_, i) => (i % 2 ? [103, 96] : [104, 97]))
  const rows = [...pre, ...london]
  const start = LONDON_OPEN - pre.length * M15
  let prev = 100
  return rows.map(([high, low, close, volume], i) => {
    const c = close ?? (high + low) / 2
    const open = Math.min(Math.max(prev, low), high)
    prev = c
    const v = volume ?? 10
    return { openTime: start + i * M15, closeTime: start + (i + 1) * M15 - 1, open, high, low, close: c, volume: v, quoteVolume: v * c, trades: 1, takerBuyVolume: v / 2 }
  })
}

function run(london: Row[], price: number) {
  const candles = day(london)
  const now = candles[candles.length - 1]!.closeTime + 1
  return analyzeSession(candles, DEFAULT_SESSIONS, 'london', now, price)
}

describe('session setups', () => {
  it('measures London against the Asia range before it opened', () => {
    const a = run([[103, 98]], 100)
    expect(a.reference).toMatchObject({ label: 'Asia', high: 104, low: 96 })
    expect(a.session?.status).toBe('live')
    expect(a.setup.status).toBe('waiting')
  })

  it('a confirmed breakout that holds on a retest is a buy', () => {
    const a = run(
      [
        [103, 99],
        [110, 103, 108, 40], // breakout: close 108, 4 × volume
        [111, 107, 109], // follow-through
        [109.5, 106, 107],
        [107.5, 104.5, 105.5], // retest of 104 holds
      ],
      105.5,
    )
    expect(a.events.map((e) => e.type)).toEqual(['breakout-up', 'retest'])
    expect(a.events[0]!.confirmed).toBe(true)
    const s = a.setup
    expect(s.status).toBe('valid')
    expect(s.direction).toBe('bullish')
    expect(s.entry!.to).toBe(105.5)
    expect(s.stopLoss!).toBeLessThan(104)
    expect(s.targets.map((t) => t.price)).toEqual([112, 120])
    expect(s.rewardRisk!).toBeGreaterThanOrEqual(1.5)
  })

  it('a breakout on low volume is not confirmed, so no trade', () => {
    const a = run(
      [
        [103, 99],
        [110, 103, 108, 10], // average volume
        [111, 107, 109],
        [109.5, 106, 107],
        [107.5, 104.5, 105.5],
      ],
      105.5,
    )
    expect(a.events[0]!.confirmed).toBe(false)
    expect(a.setup.status).toBe('waiting')
    expect(a.setup.entry).toBeNull()
  })

  it('waits for the follow-through candle before confirming', () => {
    const a = run([[103, 99], [110, 103, 108, 40]], 108)
    expect(a.events[0]!.confirmed).toBeNull()
    expect(a.setup.status).toBe('waiting')
  })

  it('a sweep of the Asia low that closes back inside is a buy toward the range high', () => {
    const a = run([[100, 98], [99, 95, 97]], 97)
    expect(a.events.map((e) => e.type)).toContain('reversal-up')
    const s = a.setup
    expect(s.status).toBe('valid')
    expect(s.invalidation).toBe(95)
    expect(s.targets[0]!.price).toBe(104)
  })

  it('a rejection of the Asia high is bearish: no buy on spot', () => {
    const a = run([[103, 100], [105.5, 102, 103]], 103)
    expect(a.setup.direction).toBe('bearish')
    expect(a.setup.status).toBe('no-trade')
    expect(a.setup.title).toMatch(/avoid buying/)
  })

  it('uses only candles inside the session (DST shifts which candles count)', () => {
    // The same candles analyzed for 29 Mar-style summer time would start London an hour earlier;
    // here, with winter hours, the 07:00–08:00 candles belong to the Asia reference range.
    const a = run([[103, 98]], 100)
    expect(a.session!.start).toBe(LONDON_OPEN)
    expect(a.reference!.to).toBe(LONDON_OPEN)
  })
})

describe('entry timing', () => {
  it('a setup whose entry zone the price has left is "waiting for a pullback", not valid', () => {
    const a = run([[100, 98], [99, 95, 97]], 101.5) // reclaim closed at 97; price now 101.5
    expect(a.setup.status).toBe('waiting')
    expect(a.setup.title).toMatch(/wait for a pullback to \$97\.00/)
  })

  it('a reclaim that falls back below the range low is no longer a buy', () => {
    const a = run([[100, 98], [99, 95, 97], [97, 95.5, 95.8]], 95.8)
    expect(a.setup.status).toBe('no-trade')
    expect(a.setup.conditions.find((c) => c.id === 'inside')?.met).toBe(false)
  })
})
