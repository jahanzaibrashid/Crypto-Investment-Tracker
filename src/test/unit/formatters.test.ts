import { describe, expect, it } from 'vitest'
import { D } from '@/lib/decimal'
import { DATE_FORMAT_EXAMPLE, formatDate, formatPercent, formatPrice, formatQuantity, formatUsd, parseDate, todayIso } from '@/lib/formatters'

describe('formatUsd / formatPrice', () => {
  it('formats normal amounts with 2 decimals and grouping', () => {
    expect(formatUsd('1234567.891')).toBe('$1,234,567.89')
    expect(formatUsd('0')).toBe('$0.00')
  })

  it('never renders a tiny positive price as $0.00', () => {
    expect(formatPrice('0.00001234')).toBe('$0.00001234')
    expect(formatPrice('0.000000012345')).toBe('$0.00000001235')
    expect(formatPrice('0.0523')).toBe('$0.0523')
  })

  it('handles signs', () => {
    expect(formatUsd(new D('-12.5'))).toBe('-$12.50')
    expect(formatUsd('12.5', { signed: true })).toBe('+$12.50')
    expect(formatUsd('-0.001', { signed: true })).toBe('-$0.001')
  })

  it('takes the sign from the rounded value', () => {
    expect(formatUsd('-0.000000001', { signed: true })).toBe('$0.00')
    expect(formatUsd('0.000000001', { signed: true })).toBe('$0.00')
  })
})

describe('formatPrice', () => {
  it('drops .00 for whole-dollar prices only', () => {
    expect(formatPrice('2300')).toBe('$2,300')
    expect(formatPrice('2500.000000000000')).toBe('$2,500')
    expect(formatPrice('2300.5')).toBe('$2,300.50')
    expect(formatPrice('2300.55')).toBe('$2,300.55')
    expect(formatPrice('0.00001234')).toBe('$0.00001234')
    expect(formatPrice('0')).toBe('$0.00')
  })
  it('formatUsd can drop zero cents for whole-dollar amounts', () => {
    expect(formatUsd('335', { dropZeroCents: true })).toBe('$335')
    expect(formatUsd('335.5', { dropZeroCents: true })).toBe('$335.50')
    expect(formatUsd('996', { signed: true, dropZeroCents: true })).toBe('+$996')
    expect(formatUsd('-12', { dropZeroCents: true })).toBe('-$12')
    expect(formatUsd('0', { dropZeroCents: true })).toBe('$0.00')
    expect(formatUsd('335')).toBe('$335.00') // default unchanged
  })
})

describe('formatQuantity', () => {
  it('trims trailing zeros', () => {
    expect(formatQuantity('1.50000000')).toBe('1.5')
    expect(formatQuantity('1000000')).toBe('1,000,000')
  })
  it('shows dust quantities', () => {
    expect(formatQuantity('0.000000123')).toBe('0.000000123')
  })
})

describe('formatPercent', () => {
  it('formats with sign and 2 decimals', () => {
    expect(formatPercent(new D('42.857142'))).toBe('+42.86%')
    expect(formatPercent(new D('-3.1'))).toBe('-3.10%')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(new D('0.001'))).toBe('0.00%')
    expect(formatPercent(new D('-0.001'))).toBe('0.00%')
  })
})

describe('dates', () => {
  it('formats compact table dates like the spreadsheet (18-Sep-26)', () => {
    expect(formatDate('2026-09-18')).toBe('18-Sep-26')
    expect(formatDate('2025-01-02')).toBe('2-Jan-25')
  })
  it('parses typed short dates', () => {
    expect(parseDate('1-Sep-26')).toBe('2026-09-01')
    expect(parseDate(' 01 september 2026 ')).toBe('2026-09-01')
    expect(parseDate('18/Oct/2025')).toBe('2025-10-18')
    expect(parseDate('2026-9-1')).toBe('2026-09-01')
    expect(parseDate('31-Feb-26')).toBeNull()
    expect(parseDate('1-Foo-26')).toBeNull()
    expect(parseDate('1-Marvel-26')).toBeNull()
    expect(parseDate('5-Decoy-25')).toBeNull()
    expect(parseDate('1-Sept-26')).toBe('2026-09-01')
    expect(parseDate('yesterday')).toBeNull()
  })
  it('formats DATE values without timezone shift', () => {
    expect(formatDate('2024-01-01')).toBe('1-Jan-24')
    expect(formatDate(new Date(2024, 0, 1, 23, 59))).toBe('1-Jan-24')
  })
  it('parseDate reads back whatever formatDate shows (inputs keep working if the format changes)', () => {
    for (const iso of ['2026-09-01', '2024-02-29', '2031-12-31']) expect(parseDate(formatDate(iso))).toBe(iso)
    expect(parseDate(DATE_FORMAT_EXAMPLE)).toBe('2026-09-01')
  })
  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2024, 1, 29, 23, 59))).toBe('2024-02-29')
  })
})
