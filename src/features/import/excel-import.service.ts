/**
 * Excel import (SheetJS): reads a workbook in the same format as the export
 * (sheets "Investments" and, optionally, "Sales History") and turns it into
 * validated lots ready to save.
 *
 * - Columns are found by header name, so their order doesn't matter. Only the
 *   purchase inputs are read; computed columns (P/L, current value, …) are ignored.
 * - Every lot and sale is validated with the same Zod schemas as the Add / Sell forms.
 *   A lot with any invalid sale is rejected as a whole, so its status is never wrong.
 * - Nothing in the file identifies a user: ownership is assigned by the database
 *   from the signed-in session when the lots are saved.
 */
import * as XLSX from 'xlsx'
import { D, type Dec } from '@/lib/decimal'
import { AppError } from '@/lib/errors'
import { formatDate, parseDate } from '@/lib/formatters'
import { LIMITS } from '@/lib/constants'
import { investmentFormSchema, makeSaleFormSchema, toInvestmentInput, toSaleInput } from '@/features/investments/investments.schemas'
import type { ImportLotInput, Investment } from '@/features/investments/investments.types'

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_LOTS = 2000

const INVESTMENTS_SHEET = 'Investments'
const SALES_SHEET = 'Sales History'

/** Header names as written by the export (see INVESTMENT_HEADERS / SALES_HEADERS). */
const COL = {
  coin: 'Coin',
  symbol: 'Symbol',
  coinId: 'CoinGecko ID',
  buyDate: 'Buy Date',
  buyPrice: 'Buy Price (USD)',
  quantity: 'Original Quantity',
  buyFee: 'Purchase Fees (USD)',
  status: 'Status',
  note: 'Note',
  /** Optional: files exported before exchanges were tracked don't have it. */
  exchange: 'Exchange',
  longTerm: 'Long-term',
  lotId: 'Lot ID',
  saleDate: 'Sale Date',
  saleQuantity: 'Quantity Sold',
  salePrice: 'Sale Price (USD)',
  saleFee: 'Sale Fee (USD)',
  saleNote: 'Sale Note',
} as const

const REQUIRED_INVESTMENT_COLUMNS = [COL.coin, COL.symbol, COL.coinId, COL.buyDate, COL.buyPrice, COL.quantity]
const REQUIRED_SALE_COLUMNS = [COL.coinId, COL.buyDate, COL.saleDate, COL.saleQuantity, COL.salePrice]

/** A problem with the file as a whole; nothing can be imported. */
export class ImportFileError extends AppError {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFileError'
  }
}

export interface ImportRowError {
  sheet: typeof INVESTMENTS_SHEET | typeof SALES_SHEET
  /** Spreadsheet row number as shown in Excel (header = row 1). */
  row: number
  message: string
}

export interface ParsedLot {
  /** Row in the Investments sheet. */
  row: number
  lot: ImportLotInput
}

export interface ParsedImport {
  lots: ParsedLot[]
  errors: ImportRowError[]
}

type Raw = unknown

// ---------------------------------------------------------------------------
// Cell readers
// ---------------------------------------------------------------------------

/** Undo the export's formula-injection guard (a leading apostrophe before = + - @ …). */
function unsanitize(value: string): string {
  return /^'[=+\-@\t\r＝＋－＠]/.test(value) ? value.slice(1) : value
}

function readText(v: Raw): string {
  if (v === null || v === undefined) return ''
  return unsanitize(String(v)).trim()
}

/**
 * A decimal string rounded to the column's scale. Numeric cells are floats, and Excel only
 * keeps 15 significant digits, so they are read at that precision (0.1 + 0.2 → "0.3").
 * Text such as "$1,234.50" is accepted; anything else is passed through so validation reports it.
 */
function readDecimal(v: Raw, decimals: number): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    return Number.isFinite(v) ? new D(v.toPrecision(15)).toDecimalPlaces(decimals, D.ROUND_HALF_UP).toFixed() : String(v)
  }
  const s = String(v).trim().replace(/^\$/, '').replace(/,/g, '').trim()
  return /^\d+(\.\d+)?$/.test(s) ? new D(s).toDecimalPlaces(decimals, D.ROUND_HALF_UP).toFixed() : s
}

/** YYYY-MM-DD from an Excel date serial, an ISO string or the app's short format ("1-Sep-26"). */
function readDate(v: Raw): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  return parseDate(s) ?? s
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------

interface Table {
  rows: { row: number; get: (column: string) => Raw }[]
  has: (column: string) => boolean
}

const norm = (h: string) => h.trim().toLowerCase()

function readTable(ws: XLSX.WorkSheet): Table {
  const grid = XLSX.utils.sheet_to_json<Raw[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
  const header = (grid[0] ?? []).map((h) => norm(String(h ?? '')))
  const index = new Map<string, number>()
  header.forEach((h, i) => h && !index.has(h) && index.set(h, i))
  const rows: Table['rows'] = []
  grid.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c === null || String(c).trim() === '')) return // blank line
    rows.push({ row: i + 2, get: (column) => cells[index.get(norm(column)) ?? -1] ?? null })
  })
  return { rows, has: (column) => index.has(norm(column)) }
}

function issuesToMessage(issues: { path: PropertyKey[]; message: string }[]): string {
  const messages = issues.map((i) => (i.path[0] === 'coin' ? 'Invalid coin: check Coin, Symbol and CoinGecko ID' : i.message))
  return [...new Set(messages)].join('; ')
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Parse and validate an exported workbook. Throws ImportFileError when the file can't be used at all. */
export function parseImportWorkbook(data: ArrayBuffer): ParsedImport {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(data, { type: 'array' })
  } catch {
    throw new ImportFileError('This file could not be read. Choose an .xlsx file exported from this app.')
  }

  const invSheet = wb.Sheets[INVESTMENTS_SHEET] ?? (wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined)
  if (!invSheet) throw new ImportFileError('The file is empty.')
  const inv = readTable(invSheet)
  const missing = REQUIRED_INVESTMENT_COLUMNS.filter((c) => !inv.has(c))
  if (missing.length) {
    throw new ImportFileError(
      `This doesn't look like an export from this app. The "${INVESTMENTS_SHEET}" sheet is missing: ${missing.join(', ')}.`,
    )
  }
  if (inv.rows.length === 0) throw new ImportFileError(`The "${INVESTMENTS_SHEET}" sheet has no investments.`)
  if (inv.rows.length > MAX_IMPORT_LOTS) {
    throw new ImportFileError(`The file has ${inv.rows.length} investments. Import at most ${MAX_IMPORT_LOTS} at a time.`)
  }

  const errors: ImportRowError[] = []
  const valid = new Map<number, ImportLotInput>() // by Investments row
  const byLotId = new Map<string, number>()
  const byCoinDate = new Map<string, number[]>()

  for (const r of inv.rows) {
    const status = readText(r.get(COL.status)).toUpperCase()
    const longTerm = inv.has(COL.longTerm) ? /^(yes|true|1)$/i.test(readText(r.get(COL.longTerm))) : status.startsWith('LONG-TERM')
    const parsed = investmentFormSchema.safeParse({
      coin: { id: readText(r.get(COL.coinId)), name: readText(r.get(COL.coin)), symbol: readText(r.get(COL.symbol)) },
      buyDate: readDate(r.get(COL.buyDate)),
      buyPrice: readDecimal(r.get(COL.buyPrice), LIMITS.priceDecimals),
      quantity: readDecimal(r.get(COL.quantity), LIMITS.quantityDecimals),
      buyFee: readDecimal(r.get(COL.buyFee), LIMITS.priceDecimals),
      longTerm,
      exchange: inv.has(COL.exchange) ? readText(r.get(COL.exchange)) : '',
      note: readText(r.get(COL.note)),
    })
    const lotId = readText(r.get(COL.lotId))
    if (lotId) {
      if (byLotId.has(lotId)) {
        errors.push({ sheet: INVESTMENTS_SHEET, row: r.row, message: `Lot ID ${lotId} is used on more than one row` })
        continue
      }
      byLotId.set(lotId, r.row)
    }
    if (!parsed.success) {
      errors.push({ sheet: INVESTMENTS_SHEET, row: r.row, message: issuesToMessage(parsed.error.issues) })
      continue
    }
    const input = toInvestmentInput(parsed.data)
    valid.set(r.row, { ...input, sales: [] })
    const key = `${input.coinId}|${input.buyDate}`
    byCoinDate.set(key, [...(byCoinDate.get(key) ?? []), r.row])
  }

  // Sales are attached to their lot by Lot ID, or (older exports) by coin + buy date when that is unambiguous.
  const salesSheet = wb.Sheets[SALES_SHEET]
  if (salesSheet) {
    const sales = readTable(salesSheet)
    const missingSale = REQUIRED_SALE_COLUMNS.filter((c) => !sales.has(c))
    if (sales.rows.length > 0 && missingSale.length) {
      throw new ImportFileError(`The "${SALES_SHEET}" sheet is missing: ${missingSale.join(', ')}.`)
    }
    const rejected = new Set<number>()
    const remaining = new Map<number, Dec>()

    for (const r of sales.rows) {
      const lotId = readText(r.get(COL.lotId))
      let lotRow: number | undefined
      if (lotId) {
        lotRow = byLotId.get(lotId)
        if (lotRow === undefined) {
          errors.push({ sheet: SALES_SHEET, row: r.row, message: `No purchase with Lot ID ${lotId} in the ${INVESTMENTS_SHEET} sheet` })
          continue
        }
      } else {
        const coinId = readText(r.get(COL.coinId))
        const buyDate = readDate(r.get(COL.buyDate))
        const candidates = byCoinDate.get(`${coinId}|${buyDate}`) ?? []
        if (candidates.length !== 1) {
          errors.push({
            sheet: SALES_SHEET,
            row: r.row,
            message:
              candidates.length === 0
                ? `No matching purchase of ${coinId || 'this coin'} bought ${buyDate ? formatDate(buyDate) : '(no date)'}`
                : `Several purchases of ${coinId} were bought on ${formatDate(buyDate)}; add a Lot ID column to say which one was sold`,
          })
          continue
        }
        lotRow = candidates[0]!
      }

      const lot = valid.get(lotRow)
      if (!lot || rejected.has(lotRow)) continue // the purchase row itself is invalid and already reported
      const left = remaining.get(lotRow) ?? new D(lot.quantity)
      const parsed = makeSaleFormSchema({ buyDate: lot.buyDate, remainingQuantity: left.toFixed() }).safeParse({
        soldDate: readDate(r.get(COL.saleDate)),
        quantity: readDecimal(r.get(COL.saleQuantity), LIMITS.quantityDecimals),
        price: readDecimal(r.get(COL.salePrice), LIMITS.priceDecimals),
        fee: readDecimal(r.get(COL.saleFee), LIMITS.priceDecimals),
        note: readText(r.get(COL.saleNote)),
      })
      if (!parsed.success) {
        errors.push({ sheet: SALES_SHEET, row: r.row, message: issuesToMessage(parsed.error.issues) })
        errors.push({ sheet: INVESTMENTS_SHEET, row: lotRow, message: `Skipped because its sale on ${SALES_SHEET} row ${r.row} is invalid` })
        rejected.add(lotRow)
        continue
      }
      const s = toSaleInput('', parsed.data)
      lot.sales.push({ soldDate: s.soldDate, quantity: s.quantity, price: s.price, fee: s.fee, note: s.note })
      remaining.set(lotRow, left.minus(s.quantity))
    }
    for (const row of rejected) valid.delete(row)
  }

  errors.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : a.sheet === INVESTMENTS_SHEET ? -1 : 1))
  const lots = [...valid.entries()].sort(([a], [b]) => a - b).map(([row, lot]) => ({ row, lot }))
  return { lots, errors }
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

/** Same coin, buy date, price, quantity and fee (compared as numbers, so "1.50" equals "1.5"). */
function lotKey(l: { coinId: string; buyDate: string; buyPrice: string; quantity: string; buyFee: string }): string {
  const n = (s: string) => new D(s || '0').toFixed()
  return [l.coinId, l.buyDate, n(l.buyPrice), n(l.quantity), n(l.buyFee)].join('|')
}

/**
 * Split parsed lots into new ones and ones already in the user's portfolio.
 * Matching is one-to-one: two identical rows in the file against one existing
 * lot import one and skip one, so genuine repeat purchases are not lost.
 */
export function splitDuplicates(parsed: ParsedLot[], existing: Investment[]): { toImport: ParsedLot[]; duplicates: ParsedLot[] } {
  const available = new Map<string, number>()
  for (const inv of existing) {
    const k = lotKey(inv)
    available.set(k, (available.get(k) ?? 0) + 1)
  }
  const toImport: ParsedLot[] = []
  const duplicates: ParsedLot[] = []
  for (const p of parsed) {
    const k = lotKey(p.lot)
    const left = available.get(k) ?? 0
    if (left > 0) {
      available.set(k, left - 1)
      duplicates.push(p)
    } else {
      toImport.push(p)
    }
  }
  return { toImport, duplicates }
}
