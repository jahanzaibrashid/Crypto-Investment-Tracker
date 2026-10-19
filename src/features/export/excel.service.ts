/**
 * Excel export (SheetJS). Builds a workbook from the user's COMPLETE dataset
 * (never just the visible table page) plus a portfolio summary.
 *
 * - Untrusted text (coin names, notes …) is neutralized against formula injection.
 * - Missing prices are written as an explicit "Unavailable" label — never 0.
 * - Numbers are written as numeric cells with currency/percent/date formats.
 */
import * as XLSX from 'xlsx'
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

type Cell = XLSX.CellObject

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

/** Build and download the workbook. Returns the file name. */
export function exportToExcel(input: ExportInput): string {
  const wb = buildWorkbook(input)
  const name = exportFileName(new Date(input.exportedAt))
  XLSX.writeFile(wb, name, { compression: true })
  return name
}
