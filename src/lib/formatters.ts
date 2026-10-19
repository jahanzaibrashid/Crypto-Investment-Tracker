import { D, type Dec } from './decimal'

type Num = Dec | string | number

function toDec(value: Num): Dec {
  return value instanceof D ? value : new D(value)
}

/** Insert thousands separators into a plain (non-exponent) decimal string. */
function group(fixed: string): string {
  const negative = fixed.startsWith('-')
  const body = negative ? fixed.slice(1) : fixed
  const [int = '0', frac] = body.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${frac !== undefined ? `.${frac}` : ''}`
}

function trimZeros(fixed: string, minDecimals: number): string {
  if (!fixed.includes('.')) return fixed
  const [int, rest = ''] = fixed.split('.') as [string, string]
  let frac = rest
  while (frac.length > minDecimals && frac.endsWith('0')) frac = frac.slice(0, -1)
  return frac.length ? `${int}.${frac}` : int
}

/**
 * Number of decimals needed to show `value` with `significant` significant
 * digits, never fewer than `min` nor more than `max`. Keeps tiny prices like
 * 0.00001234 from collapsing to 0.00.
 */
export function adaptiveDecimals(value: Num, { min = 2, max = 12, significant = 4 } = {}): number {
  const d = toDec(value).abs()
  if (d.isZero() || d.gte(1)) return min
  // e.g. 0.000123 -> exponent -4 -> leading zeros after the point = 3
  const leadingZeros = -d.e - 1
  return Math.min(max, Math.max(min, leadingZeros + significant))
}

/**
 * USD amount. Large values use 2 decimals; sub-dollar values get enough decimals to stay meaningful.
 * `dropZeroCents`: a whole-dollar result shows without ".00" ($2,300 instead of $2,300.00),
 * while $2,300.50 keeps its cents.
 */
export function formatUsd(value: Num, opts: { signed?: boolean; maxDecimals?: number; dropZeroCents?: boolean } = {}): string {
  const d = toDec(value)
  const decimals = adaptiveDecimals(d, { min: 2, max: opts.maxDecimals ?? 8 })
  let fixed = d.toDecimalPlaces(decimals, D.ROUND_HALF_UP).toFixed(decimals)
  fixed = trimZeros(fixed, 2)
  if (opts.dropZeroCents && /^-?[1-9]\d*\.00$/.test(fixed)) fixed = fixed.slice(0, -3)
  // Sign comes from the rounded value: -0.000000001 shows as "$0.00", not "-$0.00" or "+$0.00".
  const roundsToZero = /^-?0(\.0*)?$/.test(fixed)
  const isNeg = fixed.startsWith('-') && !roundsToZero
  const abs = fixed.replace(/^-/, '')
  const sign = isNeg ? '-' : opts.signed && !roundsToZero ? '+' : ''
  return `${sign}$${group(abs)}`
}

/**
 * Price of a single coin, shown the way it was entered: whole-dollar prices have no ".00"
 * ($2,300), prices with cents keep two decimals ($2,300.50), and micro-priced tokens get
 * up to 12 decimals so they never collapse to $0.00 ($0.00001234).
 */
export function formatPrice(value: Num): string {
  return formatUsd(value, { maxDecimals: 12, dropZeroCents: true })
}

/** Coin quantity: up to 8 decimals normally, more for dust amounts; trailing zeros trimmed. */
export function formatQuantity(value: Num): string {
  const d = toDec(value)
  const decimals = d.abs().lt('0.0001') && !d.isZero() ? adaptiveDecimals(d, { min: 0, max: 18, significant: 6 }) : 8
  return group(trimZeros(d.toDecimalPlaces(decimals, D.ROUND_DOWN).toFixed(decimals), 0))
}

export function formatPercent(value: Num | null, opts: { signed?: boolean } = { signed: true }): string {
  if (value === null) return '—'
  const d = toDec(value)
  const rounded = d.toDecimalPlaces(2, D.ROUND_HALF_UP)
  // Sign comes from the rounded value: 0.001 shows as "0.00%", -0.001 not as "-0.00%".
  const fixed = rounded.isZero() ? '0.00' : rounded.toFixed(2)
  const sign = opts.signed && rounded.gt(0) ? '+' : ''
  return `${sign}${group(fixed)}%`
}

// ---------------------------------------------------------------------------------------------
// Dates: the ONE place that decides how dates look across the app (tables, dialogs, messages,
// date inputs, their hint and placeholder, and the Excel export). To change the format, edit
// formatDate (and EXCEL_DATE_FORMAT to match); keep parseDate accepting what formatDate returns.
// ---------------------------------------------------------------------------------------------

/** How a date column is formatted in exported Excel files (Excel's own format codes). */
export const EXCEL_DATE_FORMAT = 'd-mmm-yy'

/** App date format, without timezone shifting: YYYY-MM-DD (or a Date) → "18-Sep-26". */
export function formatDate(value: string | Date): string {
  const iso = typeof value === 'string' ? value : todayIso(value)
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const month = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short' })
  return `${d}-${month}-${String(y).slice(-2)}`
}

/** Example shown in date inputs ("Format: …", "e.g. …"), always in the current app format. */
export const DATE_FORMAT_EXAMPLE = formatDate('2026-09-01')

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Month number (1–12) for a full name or any prefix of at least 3 letters ("sep", "sept", "september"); 0 if unknown. */
function monthFromName(name: string): number {
  const n = name.toLowerCase()
  return MONTHS.findIndex((full) => full.startsWith(n)) + 1
}

/**
 * Parse a typed date into YYYY-MM-DD. Accepts "1-Sep-26", "1 Sep 2026", "01-sep-2026"
 * (two-digit years are 20xx) and "2026-09-01". Returns null for anything else or impossible dates.
 */
export function parseDate(text: string): string | null {
  const t = text.trim()
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  const short = /^(\d{1,2})[\s/-]+([a-z]{3,9})[\s/-]+(\d{2}|\d{4})$/i.exec(t)
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (short) {
    m = monthFromName(short[2]!)
    if (!m) return null
    d = Number(short[1])
    y = short[3]!.length === 2 ? 2000 + Number(short[3]) : Number(short[3])
  } else {
    return null
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function formatDateTime(ms: number): string {
  return `${formatDate(new Date(ms))}, ${formatTime(ms)}`
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatRelative(ms: number, now = Date.now()): string {
  const diff = Math.max(0, Math.round((now - ms) / 1000))
  if (diff < 10) return 'just now'
  if (diff < 60) return `${diff}s ago`
  const mins = Math.floor(diff / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.floor(hours / 24)} d ago`
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** CSS class for a profit/loss value. */
export function plClass(value: Dec | null): string {
  if (value === null || value.isZero()) return 'text-foreground'
  return value.gt(0) ? 'text-success-text' : 'text-destructive-text'
}
