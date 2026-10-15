import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  INVESTMENT_HEADERS,
  buildWorkbook,
  excelDateSerial,
  exportFileName,
  sanitizeCellText,
} from '@/features/export/excel.service'
import { computeLot, summarizePortfolio } from '@/features/investments/investments.utils'
import { makeInvestment, makeSale, priceLookup } from '../fixtures'

function build(opts: { prices?: Record<string, string>; note?: string; stale?: boolean } = {}) {
  const prices = priceLookup(opts.prices ?? { bitcoin: '150' })
  const investments = [
    makeInvestment({ coinName: 'Bitcoin', quantity: '2', buyPrice: '100', buyFee: '10', note: '=HYPERLINK("http://evil","x")' }),
    makeInvestment({ coinName: 'Bitcoin', quantity: '1', buyPrice: '120', buyDate: '2024-02-01' }),
    makeInvestment({
      coinId: 'ethereum',
      coinName: 'Ethereum',
      symbol: 'ETH',
      quantity: '1',
      buyPrice: '500',
      sales: [makeSale({ quantity: '1', price: '600', fee: '5', soldDate: '2024-05-05', note: '+cmd|calc' })],
    }),
    makeInvestment({ coinId: 'mystery-coin', coinName: '@Mystery', symbol: 'MYS', quantity: '10', buyPrice: '1' }),
  ]
  const lots = investments.map((i) => computeLot(i, prices))
  const summary = summarizePortfolio(lots)
  const wb = buildWorkbook({
    lots,
    summary,
    portfolioNote: opts.note ?? '-2+3',
    exportedAt: new Date(2024, 5, 1, 12, 0, 0).getTime(),
    pricesFetchedAt: new Date(2024, 5, 1, 11, 59, 0).getTime(),
    pricesStale: opts.stale ?? false,
  })
  // Round-trip through the real xlsx writer/reader to make sure the file is valid.
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return { wb: XLSX.read(bytes, { type: 'array', cellNF: true }), lots, summary }
}

const cell = (ws: XLSX.WorkSheet, ref: string) => ws[ref] as XLSX.CellObject | undefined

describe('sanitizeCellText', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\t=x', "'\t=x"],
    ['\r=x', "'\r=x"],
    ['＝1+1', "'＝1+1"],
    ['Bitcoin', 'Bitcoin'],
    ['a=b', 'a=b'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(sanitizeCellText(input)).toBe(expected)
  })
})

describe('buildWorkbook', () => {
  it('produces a valid xlsx with Investments, Portfolio Summary and Sales History sheets', () => {
    const { wb } = build()
    expect(wb.SheetNames).toEqual(['Investments', 'Portfolio Summary', 'Sales History'])
  })

  it('exports every record (not just one page) with the required columns', () => {
    const { wb } = build()
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Investments!)
    expect(rows).toHaveLength(4)
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Investments!, { header: 1 })[0]
    expect(header).toEqual([...INVESTMENT_HEADERS])
  })

  it('writes numeric cells with currency, percent and date formats', () => {
    const { wb } = build()
    const ws = wb.Sheets.Investments!
    // Row 2 = first lot. D = buy date, E = buy price, I = cost basis, R = ROI
    expect(cell(ws, 'D2')).toMatchObject({ t: 'n', v: excelDateSerial('2024-01-01') })
    expect(cell(ws, 'D2')!.z).toBe('yyyy-mm-dd')
    expect(cell(ws, 'I2')).toMatchObject({ t: 'n', v: 210 })
    expect(String(cell(ws, 'I2')!.z)).toContain('$')
    expect(cell(ws, 'N2')).toMatchObject({ t: 'n', v: 300 }) // current value
    expect(cell(ws, 'R2')!.v).toBeCloseTo(90 / 210, 10)
    expect(String(cell(ws, 'R2')!.z)).toContain('%')
  })

  it('marks unavailable prices explicitly instead of writing zero', () => {
    const { wb } = build()
    const ws = wb.Sheets.Investments!
    // Row 5 = mystery coin with no price
    expect(cell(ws, 'L5')).toMatchObject({ t: 's', v: 'Unavailable' })
    expect(cell(ws, 'M5')).toMatchObject({ v: 'Unavailable' })
    expect(cell(ws, 'N5')).toMatchObject({ t: 's', v: 'Unavailable' })
    expect(cell(ws, 'P5')).toMatchObject({ t: 's', v: 'Unavailable' })
  })

  it('records sold positions with realized P/L and sale details', () => {
    const { wb } = build()
    const ws = wb.Sheets.Investments!
    expect(cell(ws, 'S4')!.v).toBe('SOLD (PROFIT)')
    expect(cell(ws, 'Q4')).toMatchObject({ t: 'n', v: 95 })
    expect(cell(ws, 'T4')).toMatchObject({ t: 'n', v: excelDateSerial('2024-05-05') })
    const sales = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Sales History']!)
    expect(sales).toHaveLength(1)
    expect(sales[0]!['Realized P/L (USD)']).toBe(95)
  })

  it('neutralizes formula injection in untrusted text', () => {
    const { wb } = build()
    const ws = wb.Sheets.Investments!
    expect(cell(ws, 'X2')!.v).toBe('\'=HYPERLINK("http://evil","x")')
    expect(cell(ws, 'X2')!.f).toBeUndefined()
    expect(cell(ws, 'A5')!.v).toBe("'@Mystery")
    const sales = wb.Sheets['Sales History']!
    expect(cell(sales, 'N2')!.v).toBe("'+cmd|calc")
    const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Portfolio Summary']!, { header: 1 })
    const noteRow = summary.find((r) => r[0] === 'Portfolio note')
    expect(noteRow![1]).toBe("'-2+3")
    // No cell anywhere carries a formula
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]!
      for (const key of Object.keys(sheet)) {
        if (!key.startsWith('!')) expect((sheet[key] as XLSX.CellObject).f).toBeUndefined()
      }
    }
  })

  it('summary sheet contains totals and price warnings', () => {
    const { wb, summary } = build({ stale: true })
    const rows = XLSX.utils.sheet_to_json<[string, unknown]>(wb.Sheets['Portfolio Summary']!, { header: 1 })
    const get = (k: string) => rows.find((r) => r[0] === k)?.[1]
    expect(get('Total purchase cost (incl. fees)')).toBe(summary.totalPurchaseCost.toNumber())
    expect(get('Realized P/L')).toBe(95)
    expect(get('Unrealized P/L')).toBe(120)
    expect(get('Total P/L')).toBe(215)
    expect(get('Holdings count (open lots)')).toBe(3)
    expect(get('Sold positions count')).toBe(1)
    expect(get('Totals complete')).toMatch(/^No/)
    expect(String(get('Price warnings'))).toMatch(/STALE/)
    expect(String(get('Price warnings'))).toMatch(/mystery-coin/)
  })

  it('builds a dated file name', () => {
    expect(exportFileName(new Date(2024, 0, 9))).toBe('crypto-portfolio-2024-01-09.xlsx')
  })
})
