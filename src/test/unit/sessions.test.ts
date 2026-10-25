import { describe, expect, it } from 'vitest'
import { DEFAULT_SESSIONS, sessionWindows, zonedTimeToUtc, type SessionConfig } from '@/features/analyzer/sessions'

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
