/**
 * Trading session hours (Asia, London, New York) for the session-times card. Pure, no I/O.
 *
 * Session hours (local market time)
 *   Asia      09:00–18:00 Asia/Tokyo          (Japan has no DST: 00:00–09:00 UTC)
 *   London    08:00–17:00 Europe/London       (07:00–16:00 UTC in summer, 08:00–17:00 in winter)
 *   New York  08:00–17:00 America/New_York    (12:00–21:00 UTC in summer, 13:00–22:00 in winter)
 * In "local" mode the hours are converted to UTC for each date with the time zone's rules, so
 * daylight saving is automatic. In "utc" mode the same HH:MM values are used as fixed UTC times.
 * Sessions run Monday–Friday (local date): the markets that define them are closed at weekends.
 */

export type SessionId = 'asia' | 'london' | 'newyork'
export type TimeMode = 'local' | 'utc'

export interface SessionDef {
  id: SessionId
  label: string
  timeZone: string
  /** HH:MM */
  start: string
  end: string
}

export interface SessionConfig {
  mode: TimeMode
  sessions: Record<SessionId, SessionDef>
}

export const SESSION_ORDER: SessionId[] = ['asia', 'london', 'newyork']


export const DEFAULT_SESSIONS: SessionConfig = {
  mode: 'local',
  sessions: {
    asia: { id: 'asia', label: 'Asia', timeZone: 'Asia/Tokyo', start: '09:00', end: '18:00' },
    london: { id: 'london', label: 'London', timeZone: 'Europe/London', start: '08:00', end: '17:00' },
    newyork: { id: 'newyork', label: 'New York', timeZone: 'America/New_York', start: '08:00', end: '17:00' },
  },
}


// ---------------------------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Offset of `timeZone` from UTC at an instant, in ms (e.g. +3_600_000 for BST). */
export function tzOffsetMs(utcMs: number, timeZone: string): number {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  const parts = f.formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** UTC instant of a wall-clock time in a time zone (DST-aware). */
export function zonedTimeToUtc(year: number, month: number, day: number, hhmm: string, timeZone: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  const guess = Date.UTC(year, month - 1, day, h, m)
  const first = tzOffsetMs(guess, timeZone)
  const utc = guess - first
  const second = tzOffsetMs(utc, timeZone)
  return second === first ? utc : guess - second
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const isValidTime = (v: string) => HHMM.test(v)

export interface SessionWindow {
  id: SessionId
  label: string
  /** UTC ms, inclusive. */
  start: number
  /** UTC ms, exclusive. */
  end: number
}

/** Every window of every session overlapping [from, to], sorted by start. */
export function sessionWindows(config: SessionConfig, from: number, to: number): SessionWindow[] {
  const out: SessionWindow[] = []
  const DAY = 86_400_000
  for (let day = Math.floor(from / DAY) * DAY - DAY; day <= to + DAY; day += DAY) {
    const d = new Date(day)
    // Traditional markets are closed at the weekend: no sessions on a local Saturday or Sunday.
    const weekday = d.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    for (const id of SESSION_ORDER) {
      const s = config.sessions[id]
      if (!isValidTime(s.start) || !isValidTime(s.end)) continue
      const tz = config.mode === 'local' ? s.timeZone : 'UTC'
      const start = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), s.start, tz)
      let end = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), s.end, tz)
      if (end <= start) end += DAY // crosses midnight
      if (end > from && start <= to) out.push({ id, label: s.label, start, end })
    }
  }
  const seen = new Set<string>()
  return out
    .sort((a, b) => a.start - b.start)
    .filter((w) => {
      const key = `${w.id}-${w.start}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
