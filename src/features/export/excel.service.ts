/**
 * Excel export (SheetJS). Builds a workbook from the user's COMPLETE dataset
 * (never just the visible table page) plus a portfolio summary.
 *
 * - Untrusted text (coin names, notes …) is neutralized against formula injection.
 * - Missing prices are written as an explicit "Unavailable" label — never 0.
 * - Numbers are written as numeric cells with currency/percent/date formats.
 */
// xlsx-js-style: the SheetJS API plus cell styles (font colours on the Spot Trade sheet).
import * as XLSX from 'xlsx-js-style'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { ZERO, type Dec } from '@/lib/decimal'
import { EXCEL_DATE_FORMAT, todayIso } from '@/lib/formatters'
import type { LotMetrics, PortfolioSummary } from '@/features/investments/investments.utils'
import { displayROI, positionKind } from '@/features/investments/investments.utils'

const FMT = {
  usd: '"$"#,##0.00;[Red]-"$"#,##0.00',
  price: '"$"#,##0.00##########;[Red]-"$"#,##0.00##########',
  qty: '#,##0.##################',
  pct: '0.00%;[Red]-0.00%',
  date: EXCEL_DATE_FORMAT,
  datetime: `${EXCEL_DATE_FORMAT} hh:mm:ss`,
} as const

const UNAVAILABLE = 'Unavailable'

const STATUS_TEXT = { HOLDING: 'HOLDING', LONG_TERM: 'LONG-TERM HOLDING', SOLD_PROFIT: 'SOLD (PROFIT)', SOLD_LOSS: 'SOLD (LOSS)' } as const

/**
 * Neutralize strings that a spreadsheet could interpret as a formula
 * (leading = + - @, tab or carriage return; also full-width variants) by
 * prefixing an apostrophe, per OWASP CSV-injection guidance.
 */
export function sanitizeCellText(value: string): string {
  return /^[=+\-@\t\r＝＋－＠]/.test(value) ? `'${value}` : value
}

type Cell = XLSX.CellObject & { s?: CellStyle }
interface CellStyle {
  font?: { name?: string; sz?: number; bold?: boolean; color?: { rgb: string } }
  alignment?: { horizontal?: 'center'; vertical?: 'center' }
}

const text = (v: string | null | undefined): Cell => ({ t: 's', v: sanitizeCellText(v ?? '') })
const num = (v: Dec | null, z: string): Cell => (v === null ? { t: 's', v: UNAVAILABLE } : { t: 'n', v: v.toNumber(), z })
const blank = (): Cell => ({ t: 's', v: '' })

/** Excel serial date for a YYYY-MM-DD string, computed in UTC to avoid timezone drift. */
export function excelDateSerial(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}
function excelDateTimeSerial(ms: number): number {
  const dt = new Date(ms)
  const localAsUtc = Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds())
  return (localAsUtc - Date.UTC(1899, 11, 30)) / 86_400_000
}
const date = (iso: string | null): Cell => (iso ? { t: 'n', v: excelDateSerial(iso), z: FMT.date } : blank())
const pct = (v: Dec | null): Cell => (v === null ? { t: 's', v: 'N/A' } : { t: 'n', v: v.dividedBy(100).toNumber(), z: FMT.pct })

export const INVESTMENT_HEADERS = [
  'Coin',
  'Symbol',
  'CoinGecko ID',
  'Buy Date',
  'Buy Price (USD)',
  'Original Quantity',
  'Gross Purchase (USD)',
  'Purchase Fees (USD)',
  'Total Cost Basis (USD)',
  'Sold Quantity',
  'Remaining Quantity',
  'Current Price (USD)',
  'Price Status',
  'Current Value (USD)',
  'Remaining Cost Basis (USD)',
  'Unrealized P/L (USD)',
  'Realized P/L (USD)',
  'ROI',
  'Status',
  'Last Sale Date',
  'Avg Sale Price (USD)',
  'Net Sale Proceeds (USD)',
  'Sale Fees (USD)',
  'Note',
  'Exchange',
  // Used by Import: the long-term flag, and a key that links rows in Sales History to their lot.
  'Long-term',
  'Lot ID',
] as const

export const SALES_HEADERS = [
  'Coin',
  'Symbol',
  'CoinGecko ID',
  'Buy Date',
  'Sale Date',
  'Quantity Sold',
  'Sale Price (USD)',
  'Gross Proceeds (USD)',
  'Sale Fee (USD)',
  'Net Proceeds (USD)',
  'Allocated Cost Basis (USD)',
  'Realized P/L (USD)',
  'Realized ROI',
  'Sale Note',
  'Lot ID',
] as const

function investmentRow(lot: LotMetrics): Cell[] {
  const inv = lot.investment
  const open = lot.status === 'HOLDING'
  const hasSales = lot.sales.length > 0
  const avgSale =
    hasSales && lot.soldQuantity.gt(0)
      ? lot.sales.reduce((acc, s) => acc.plus(s.grossProceeds), ZERO).dividedBy(lot.soldQuantity)
      : null
  const lastSale = hasSales ? lot.sales[lot.sales.length - 1]!.sale.soldDate : null
  const saleFees = lot.sales.reduce((acc, s) => acc.plus(s.fee), ZERO)
  const priceStatus = !open ? 'N/A (sold)' : lot.priceStatus === 'live' ? 'Live' : lot.priceStatus === 'stale' ? 'Stale' : UNAVAILABLE

  return [
    text(inv.coinName),
    text(inv.symbol),
    text(inv.coinId),
    date(inv.buyDate),
    num(lot.buyPrice, FMT.price),
    num(lot.quantity, FMT.qty),
    num(lot.grossPurchaseCost, FMT.usd),
    num(lot.buyFee, FMT.usd),
    num(lot.totalCostBasis, FMT.usd),
    num(lot.soldQuantity, FMT.qty),
    num(lot.remainingQuantity, FMT.qty),
    open ? num(lot.currentPrice, FMT.price) : text('N/A (sold)'),
    text(priceStatus),
    num(lot.currentValue, FMT.usd),
    num(lot.remainingCostBasis, FMT.usd),
    num(lot.unrealizedPL, FMT.usd),
    num(lot.realizedPL, FMT.usd),
    pct(displayROI(lot)),
    text(STATUS_TEXT[positionKind(lot)] + (lot.isPartiallySold ? ' (partially sold)' : '')),
    date(lastSale),
    avgSale ? num(avgSale, FMT.price) : blank(),
    hasSales ? num(lot.netSaleProceeds, FMT.usd) : blank(),
    hasSales ? num(saleFees, FMT.usd) : blank(),
    text(inv.note),
    text(inv.exchange),
    text(inv.longTerm ? 'Yes' : 'No'),
    text(inv.id),
  ]
}

function salesRows(lots: LotMetrics[]): Cell[][] {
  const rows: Cell[][] = []
  for (const lot of lots) {
    for (const s of lot.sales) {
      rows.push([
        text(lot.investment.coinName),
        text(lot.investment.symbol),
        text(lot.investment.coinId),
        date(lot.investment.buyDate),
        date(s.sale.soldDate),
        num(s.quantity, FMT.qty),
        num(s.quantity.isZero() ? s.quantity : s.grossProceeds.dividedBy(s.quantity), FMT.price),
        num(s.grossProceeds, FMT.usd),
        num(s.fee, FMT.usd),
        num(s.netProceeds, FMT.usd),
        num(s.allocatedCostBasis, FMT.usd),
        num(s.realizedPL, FMT.usd),
        pct(s.realizedROI),
        text(s.sale.note),
        text(lot.investment.id),
      ])
    }
  }
  return rows
}

/**
 * "Spot Trade" sheet: the user's own trading-sheet layout (columns A–K and their formulas kept exactly),
 * plus a Binance fee column. One row per sale, plus one row for the quantity still held.
 */
export const SPOT_TRADE_HEADERS = [
  'Coin',
  'Qty',
  'Buy At',
  '$ Invested (f)',
  'Buy Date',
  'Value/Sold at',
  'ROI (f)',
  '% (f)',
  'Total PnL (f)',
  'Sold Date',
  'Note',
  '$ Fees (f)',
] as const

/** Binance spot fee per side: charged on the buy, and again on the sale once sold. */
const BINANCE_FEE = 0.00075

const SPOT_FMT = { usd: '[$$-409]#,##0.00', num: '0.00', pct: '0.00%', date: 'd-mmm-yy' } as const

/** Two decimals, but whole amounts without them (462.50, but 51 rather than 51.00). */
const spotAmount = (v: number, fmt: string) => (v.toFixed(2).endsWith('.00') ? fmt.replace('.00', '') : fmt)

/** Font colours from the user's sheet: green = sold in profit; held rows stay black. */
const SPOT_COLOR = { profit: '00B050', loss: 'C00000', held: '000000', formulaHeader: '2F5496' } as const
const spotFont = (rgb: string, bold = false): CellStyle => ({
  font: { name: 'Calibri', sz: 14, bold, color: { rgb } },
  alignment: { horizontal: 'center', vertical: 'center' },
})
/** Header cells of formula columns are blue in the user's sheet. */
const SPOT_FORMULA_COLS = new Set([3, 6, 7, 8, 11])

interface SpotTrade {
  lot: LotMetrics
  quantity: Dec
  /** Sale price, or the current price for the held quantity (null when unavailable). */
  price: Dec | null
  soldDate: string | null
  note: string | null
}

/** The Note column: the note, then the exchange (and a missing price, for held rows). */
const spotNote = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null

function spotTrades(lots: LotMetrics[]): SpotTrade[] {
  const sold: SpotTrade[] = []
  const held: SpotTrade[] = []
  for (const lot of lots) {
    const exchange = lot.investment.exchange ? `Exchange: ${lot.investment.exchange}` : null
    for (const s of lot.sales) {
      sold.push({
        lot,
        quantity: s.quantity,
        price: s.quantity.isZero() ? ZERO : s.grossProceeds.dividedBy(s.quantity),
        soldDate: s.sale.soldDate,
        note: spotNote(s.sale.note || lot.investment.note, exchange),
      })
    }
    if (lot.remainingQuantity.gt(0)) {
      held.push({
        lot,
        quantity: lot.remainingQuantity,
        price: lot.currentPrice,
        soldDate: null,
        note: spotNote(lot.investment.note, exchange, lot.currentPrice === null ? 'Current price unavailable' : null),
      })
    }
  }
  sold.sort((a, b) => a.soldDate!.localeCompare(b.soldDate!) || a.lot.investment.buyDate.localeCompare(b.lot.investment.buyDate))
  held.sort((a, b) => a.lot.investment.buyDate.localeCompare(b.lot.investment.buyDate))
  return [...sold, ...held]
}

function spotTradeRows(lots: LotMetrics[]): Cell[][] {
  let runningPnl = 0
  return spotTrades(lots).map((t, i) => {
    const n = i + 2 // sheet row (row 1 is the header)
    const qty = t.quantity.toNumber()
    const buy = t.lot.buyPrice.toNumber()
    const invested = qty * buy
    const roi = t.price === null ? null : qty * t.price.toNumber() - invested
    if (roi !== null) runningPnl += roi
    const fees = invested * BINANCE_FEE + (t.soldDate && roi !== null ? qty * t.price!.toNumber() * BINANCE_FEE : 0)
    // Sold in profit = green, sold at a loss = red, still held = black.
    const style = spotFont(!t.soldDate ? SPOT_COLOR.held : roi !== null && roi >= 0 ? SPOT_COLOR.profit : SPOT_COLOR.loss)
    // A missing current price leaves F empty; those rows guard their formulas so the totals still work.
    const priced = roi !== null
    const cells: Cell[] = [
      text(t.lot.investment.symbol.toUpperCase()),
      { t: 'n', v: qty, z: FMT.qty },
      { t: 'n', v: buy, z: FMT.qty },
      { t: 'n', v: invested, f: `C${n}*B${n}`, z: spotAmount(invested, SPOT_FMT.num) },
      date(t.lot.investment.buyDate),
      priced ? { t: 'n', v: t.price!.toNumber(), z: '0' } : blank(), // whole dollars on screen; the exact price stays in the cell
      priced ? { t: 'n', v: roi, f: `(B${n}*F${n}) - (B${n}*C${n})`, z: spotAmount(roi, SPOT_FMT.usd) } : { t: 's', v: '', f: `IF(ISNUMBER(F${n}),(B${n}*F${n}) - (B${n}*C${n}),"")` },
      priced ? { t: 'n', v: invested === 0 ? 0 : Math.round((roi / invested) * 10_000) / 10_000, f: `ROUND(G${n}/D${n},4)`, z: SPOT_FMT.pct } : { t: 's', v: '', f: `IF(ISNUMBER(G${n}),ROUND(G${n}/D${n},4),"")` },
      { t: 'n', v: runningPnl, f: `SUM($G$2:G${n})`, z: spotAmount(runningPnl, SPOT_FMT.num) },
      t.soldDate ? { t: 'n', v: excelDateSerial(t.soldDate), z: SPOT_FMT.date } : blank(),
      text(t.note),
      { t: 'n', v: fees, f: `D${n}*0.075% + IF(ISNUMBER(J${n}),B${n}*F${n}*0.075%,0)`, z: spotAmount(fees, SPOT_FMT.num) },
    ]
    return cells.map((c) => ({ ...c, s: style }))
  })
}

function sheetFromRows(headers: readonly string[], rows: Cell[][], widths: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  const all: Cell[][] = [headers.map((h) => ({ t: 's', v: h }) as Cell), ...rows]
  all.forEach((row, r) => {
    row.forEach((cell, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = cell
    })
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(all.length - 1, 0), c: headers.length - 1 } })
  ws['!cols'] = widths.map((wch) => ({ wch }))
  if (rows.length > 0) ws['!autofilter'] = { ref: ws['!ref'] }
  return ws
}

export interface ExportInput {
  lots: LotMetrics[]
  summary: PortfolioSummary
  portfolioNote: string | null
  exportedAt: number
  /** Last successful price fetch (ms) */
  pricesFetchedAt: number | null
  pricesStale: boolean
}

export function buildWorkbook(input: ExportInput): XLSX.WorkBook {
  const { lots, summary } = input
  const wb = XLSX.utils.book_new()

  const spotWidths = [9, 13, 17, 20, 19, 25, 14, 14, 17, 20, 40, 14]
  const spot = sheetFromRows(SPOT_TRADE_HEADERS, spotTradeRows(lots), spotWidths)
  SPOT_TRADE_HEADERS.forEach((_, c) => {
    ;(spot[XLSX.utils.encode_cell({ r: 0, c })] as Cell).s = spotFont(SPOT_FORMULA_COLS.has(c) ? SPOT_COLOR.formulaHeader : SPOT_COLOR.held, true)
  })
  XLSX.utils.book_append_sheet(wb, spot, 'Spot Trade')

  const invWidths = [18, 8, 18, 12, 18, 18, 18, 14, 18, 16, 18, 18, 12, 18, 20, 18, 18, 10, 24, 14, 18, 20, 14, 40, 10, 38]
  XLSX.utils.book_append_sheet(wb, sheetFromRows(INVESTMENT_HEADERS, lots.map(investmentRow), invWidths), 'Investments')

  // Summary (key / value)
  const warnings: string[] = []
  if (input.pricesFetchedAt === null) warnings.push('No market prices were available at export time.')
  if (input.pricesStale) warnings.push('Market prices are STALE: the latest refresh failed or prices are old.')
  if (summary.stalePriceCoinIds.length) warnings.push(`Stale prices for: ${summary.stalePriceCoinIds.join(', ')}`)
  if (summary.missingPriceCoinIds.length) {
    warnings.push(
      `Prices unavailable for: ${summary.missingPriceCoinIds.join(', ')}. Their value and unrealized P/L are EXCLUDED from totals (cost basis excluded: $${summary.unpricedCostBasis.toFixed(2)}).`,
    )
  }

  const summaryRows: Cell[][] = [
    [text('Export timestamp'), { t: 'n', v: excelDateTimeSerial(input.exportedAt), z: FMT.datetime }],
    [text('Currency'), text('USD')],
    [text('Total purchase cost (incl. fees)'), num(summary.totalPurchaseCost, FMT.usd)],
    [text('Total purchase fees'), num(summary.totalBuyFees, FMT.usd)],
    [text('Remaining cost basis'), num(summary.remainingCostBasis, FMT.usd)],
    [text('Cost basis of sold units'), num(summary.soldCostBasis, FMT.usd)],
    [text('Current portfolio value'), num(summary.currentValue, FMT.usd)],
    [text('Net sale proceeds'), num(summary.netSaleProceeds, FMT.usd)],
    [text('Realized P/L'), num(summary.realizedPL, FMT.usd)],
    [text('Unrealized P/L'), num(summary.unrealizedPL, FMT.usd)],
    [text('Total P/L'), num(summary.totalPL, FMT.usd)],
    [text('Overall ROI'), pct(summary.overallROI)],
    [text('Holdings count (open lots)'), { t: 'n', v: summary.openLotCount }],
    [text('Coins held'), { t: 'n', v: summary.coinsHeld }],
    [text('Sold positions count'), { t: 'n', v: summary.soldLotCount }],
    [text('Partially sold lots'), { t: 'n', v: summary.partiallySoldLotCount }],
    [text('Totals complete'), text(summary.isComplete ? 'Yes' : 'No — some prices unavailable')],
    [
      text('Market prices fetched at'),
      input.pricesFetchedAt === null ? text(UNAVAILABLE) : { t: 'n', v: excelDateTimeSerial(input.pricesFetchedAt), z: FMT.datetime },
    ],
    [text('Price source'), text('CoinGecko (USD)')],
    [text('Price warnings'), text(warnings.length ? warnings.join(' ') : 'None')],
    [text('Portfolio note'), text(input.portfolioNote)],
    [text('Definitions'), text('Cost basis includes purchase fees. Realized P/L = net sale proceeds − cost allocated to sold units (proportional). Unrealized P/L = current value − remaining cost basis. Overall ROI = total P/L ÷ (sold cost basis + remaining cost basis of priced holdings).')],
  ]
  XLSX.utils.book_append_sheet(wb, sheetFromRows(['Metric', 'Value'], summaryRows, [34, 80]), 'Portfolio Summary')

  XLSX.utils.book_append_sheet(wb, sheetFromRows(SALES_HEADERS, salesRows(lots), [18, 8, 18, 12, 12, 16, 18, 18, 14, 18, 20, 18, 12, 40, 38]), 'Sales History')

  wb.Props = { Title: 'Crypto Investment Portfolio', CreatedDate: new Date(input.exportedAt) }
  return wb
}

export function exportFileName(now = new Date()): string {
  return `crypto-portfolio-${todayIso(now)}.xlsx`
}

/**
 * Freeze the header row of every sheet. SheetJS can't write frozen panes, so the sheet XML of the
 * finished file is patched: the empty <sheetView/> gets a frozen pane below row 1.
 */
export function freezeHeaderRows(xlsx: Uint8Array): Uint8Array {
  const files = unzipSync(xlsx)
  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue
    const xml = strFromU8(files[path]!)
    files[path] = strToU8(
      xml.replace(/<sheetView([^>]*)\/>/, '<sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>'),
    )
  }
  return zipSync(files)
}

/** Build and download the workbook. Returns the file name. */
export function exportToExcel(input: ExportInput): string {
  const wb = buildWorkbook(input)
  const name = exportFileName(new Date(input.exportedAt))
  const data = freezeHeaderRows(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer))
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return name
}
