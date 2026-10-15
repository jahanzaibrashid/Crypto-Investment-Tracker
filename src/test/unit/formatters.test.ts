import { describe, expect, it } from 'vitest'
import { D } from '@/lib/decimal'
import { formatDate, formatPercent, formatPrice, formatPriceCompact, formatQuantity, formatShortDate, formatUsd, parseShortDate, todayIso } from '@/lib/formatters'

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

describe('formatPriceCompact', () => {
  it('drops .00 for whole-dollar prices only', () => {
    expect(formatPriceCompact('2500')).toBe('$2,500')
    expect(formatPriceCompact('2500.000000000000')).toBe('$2,500')
    expect(formatPriceCompact('2032.5')).toBe('$2,032.50')
    expect(formatPriceCompact('0.00001234')).toBe('$0.00001234')
    expect(formatPriceCompact('0')).toBe('$0.00')
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
    expect(formatShortDate('2026-09-18')).toBe('18-Sep-26')
    expect(formatShortDate('2025-01-02')).toBe('2-Jan-25')
  })
  it('parses typed short dates', () => {
    expect(parseShortDate('1-Sep-26')).toBe('2026-09-01')
    expect(parseShortDate(' 01 september 2026 ')).toBe('2026-09-01')
    expect(parseShortDate('18/Oct/2025')).toBe('2025-10-18')
    expect(parseShortDate('2026-9-1')).toBe('2026-09-01')
    expect(parseShortDate('31-Feb-26')).toBeNull()
    expect(parseShortDate('1-Foo-26')).toBeNull()
    expect(parseShortDate('1-Marvel-26')).toBeNull()
    expect(parseShortDate('5-Decoy-25')).toBeNull()
    expect(parseShortDate('1-Sept-26')).toBe('2026-09-01')
    expect(parseShortDate('yesterday')).toBeNull()
  })
  it('formats DATE values without timezone shift', () => {
    expect(formatDate('2024-01-01')).toBe('Jan 1, 2024')
  })
  it('todayIso uses the local calendar date', () => {
    expect(todayIso(new Date(2024, 1, 29, 23, 59))).toBe('2024-02-29')
  })
})
