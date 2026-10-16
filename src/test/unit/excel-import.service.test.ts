import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook } from '@/features/export/excel.service'
import { ImportFileError, parseImportWorkbook, splitDuplicates } from '@/features/import/excel-import.service'
import { computeLot, summarizePortfolio } from '@/features/investments/investments.utils'
import type { Investment } from '@/features/investments/investments.types'
import { makeInvestment, makeSale, priceLookup } from '../fixtures'

/** Write investments through the real export and return the .xlsx bytes. */
function exported(investments: Investment[]): ArrayBuffer {
  const lots = investments.map((i) => computeLot(i, priceLookup({ bitcoin: '150' })))
  const wb = buildWorkbook({
    lots,
    summary: summarizePortfolio(lots),
    portfolioNote: null,
    exportedAt: Date.now(),
    pricesFetchedAt: Date.now(),
    pricesStale: false,
  })
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

/** Build an .xlsx from plain rows (header first) for hand-made files. */
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const INV_HEADER = ['Coin', 'Symbol', 'CoinGecko ID', 'Buy Date', 'Buy Price (USD)', 'Original Quantity', 'Purchase Fees (USD)', 'Note']
const SALE_HEADER = ['CoinGecko ID', 'Buy Date', 'Sale Date', 'Quantity Sold', 'Sale Price (USD)', 'Sale Fee (USD)']

describe('parseImportWorkbook', () => {
  it('round-trips an export: purchases, fees, notes, long-term flag and sales', () => {
    const data = exported([
      makeInvestment({ id: 'a', quantity: '2', buyPrice: '100', buyFee: '10', note: '=SUM(A1)', longTerm: true }),
      makeInvestment({
        id: 'b',
        coinId: 'ethereum',
        coinName: 'Ethereum',
        symbol: 'ETH',
        buyDate: '2024-02-01',
        quantity: '1.5',
        buyPrice: '2500.25',
        sales: [makeSale({ investmentId: 'b', soldDate: '2024-03-01', quantity: '0.5', price: '3000', fee: '2', note: 'partial' })],
      }),
    ])
    const { lots, errors } = parseImportWorkbook(data)
    expect(errors).toEqual([])
    expect(lots.map((l) => l.lot)).toEqual([
      {
        coinId: 'bitcoin',
        coinName: 'Bitcoin',
        symbol: 'BTC',
        buyDate: '2024-01-01',
        buyPrice: '100',
        quantity: '2',
        buyFee: '10',
        longTerm: true,
        note: '=SUM(A1)', // the export's formula guard is removed again
        sales: [],
      },
      {
        coinId: 'ethereum',
        coinName: 'Ethereum',
        symbol: 'ETH',
        buyDate: '2024-02-01',
        buyPrice: '2500.25',
        quantity: '1.5',
        buyFee: '0',
        longTerm: false,
        note: null,
        sales: [{ soldDate: '2024-03-01', quantity: '0.5', price: '3000', fee: '2', note: 'partial' }],
      },
    ])
  })

  it('links each sale to the right purchase by Lot ID when two lots share a coin and date', () => {
    const data = exported([
      makeInvestment({ id: 'x', quantity: '1' }),
      makeInvestment({ id: 'y', quantity: '3', sales: [makeSale({ investmentId: 'y', quantity: '3', soldDate: '2024-06-01' })] }),
    ])
    const { lots, errors } = parseImportWorkbook(data)
    expect(errors).toEqual([])
    expect(lots.map((l) => [l.lot.quantity, l.lot.sales.length])).toEqual([
      ['1', 0],
      ['3', 1],
    ])
  })

  it('reports invalid rows and keeps the valid ones', () => {
    const data = workbook({
      Investments: [
        INV_HEADER,
        ['Bitcoin', 'BTC', 'bitcoin', '2024-01-01', 100, 1, 0, ''],
        ['Bitcoin', 'BTC', 'bitcoin', '2024-01-01', -5, 1, 0, ''],
        ['Nope', 'NO', 'Not A Valid Id', '2024-01-01', 1, 1, 0, ''],
        [null, null, null, null, null, null, null, null], // blank line is ignored
        ['Bitcoin', 'BTC', 'bitcoin', '2999-01-01', 1, 1, 0, ''],
      ],
    })
    const { lots, errors } = parseImportWorkbook(data)
    expect(lots.map((l) => l.row)).toEqual([2])
    expect(errors.map((e) => [e.row, e.message])).toEqual([
      [3, expect.stringMatching(/Buy price/)],
      [4, expect.stringMatching(/Invalid coin/)],
      [6, expect.stringMatching(/future/)],
    ])
  })

  it('rejects a purchase whose sale is invalid, so a lot is never saved with a wrong status', () => {
    const data = workbook({
      Investments: [INV_HEADER, ['Bitcoin', 'BTC', 'bitcoin', '2024-01-01', 100, 1, 0, '']],
      'Sales History': [SALE_HEADER, ['bitcoin', '2024-01-01', '2024-02-01', 5, 120, 0]],
    })
    const { lots, errors } = parseImportWorkbook(data)
    expect(lots).toEqual([])
    expect(errors).toEqual([
      { sheet: 'Investments', row: 2, message: expect.stringMatching(/sale on Sales History row 2 is invalid/) },
      { sheet: 'Sales History', row: 2, message: expect.stringMatching(/at most 1/) },
    ])
  })

  it('asks for a Lot ID when a sale could belong to several purchases', () => {
    const data = workbook({
      Investments: [INV_HEADER, ['Bitcoin', 'BTC', 'bitcoin', '2024-01-01', 100, 1, 0, ''], ['Bitcoin', 'BTC', 'bitcoin', '2024-01-01', 110, 1, 0, '']],
      'Sales History': [SALE_HEADER, ['bitcoin', '2024-01-01', '2024-02-01', 1, 120, 0]],
    })
    const { lots, errors } = parseImportWorkbook(data)
    expect(lots).toHaveLength(2)
    expect(errors).toEqual([{ sheet: 'Sales History', row: 2, message: expect.stringMatching(/Several purchases.*Lot ID/) }])
  })

  it('accepts text numbers and dates, and rounds float artifacts to the column scale', () => {
    const data = workbook({
      Investments: [INV_HEADER, ['Solana', 'SOL', 'solana', '1-Sep-24', '$1,234.50', 0.1 + 0.2, '', '']],
    })
    const { lots, errors } = parseImportWorkbook(data)
    expect(errors).toEqual([])
    expect(lots[0]!.lot).toMatchObject({ buyDate: '2024-09-01', buyPrice: '1234.5', quantity: '0.3', buyFee: '0' })
  })

  it('refuses files that are not an export from this app', () => {
    expect(() => parseImportWorkbook(workbook({ Sheet1: [['Name', 'Amount'], ['x', 1]] }))).toThrow(ImportFileError)
    expect(() => parseImportWorkbook(workbook({ Investments: [INV_HEADER] }))).toThrow(/no investments/)
    expect(() => parseImportWorkbook(new TextEncoder().encode('not a spreadsheet').buffer)).toThrow(ImportFileError)
  })
})

describe('splitDuplicates', () => {
  const parsed = (rows: Partial<Investment>[]) =>
    rows.map((r, i) => {
      const inv = makeInvestment(r)
      return {
        row: i + 2,
        lot: { coinId: inv.coinId, coinName: inv.coinName, symbol: inv.symbol, buyDate: inv.buyDate, buyPrice: inv.buyPrice, quantity: inv.quantity, buyFee: inv.buyFee, longTerm: false, note: null, sales: [] },
      }
    })

  it('skips lots already in the portfolio (numbers compared by value)', () => {
    const existing = [makeInvestment({ buyPrice: '100.50', quantity: '2' })]
    const { toImport, duplicates } = splitDuplicates(parsed([{ buyPrice: '100.5', quantity: '2.0' }, { buyPrice: '99' }]), existing)
    expect(duplicates.map((d) => d.row)).toEqual([2])
    expect(toImport.map((d) => d.row)).toEqual([3])
  })

  it('matches one-to-one, so repeat purchases in the file are not all dropped', () => {
    const existing = [makeInvestment()]
    const { toImport, duplicates } = splitDuplicates(parsed([{}, {}]), existing)
    expect(duplicates).toHaveLength(1)
    expect(toImport).toHaveLength(1)
  })
})
