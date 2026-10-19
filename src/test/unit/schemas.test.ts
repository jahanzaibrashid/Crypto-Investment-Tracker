import { describe, expect, it } from 'vitest'
import { investmentFormSchema, makeInvestmentFormSchema, makeSaleFormSchema, toInvestmentInput } from '@/features/investments/investments.schemas'
import { registerSchema } from '@/features/auth/auth.schemas'
import { mapDbError, SessionExpiredError } from '@/lib/errors'
import { todayIso } from '@/lib/formatters'

const valid = {
  coin: { id: 'bitcoin', name: 'Bitcoin', symbol: 'btc' },
  buyDate: '2024-01-15',
  buyPrice: '42000.50',
  quantity: '0.015',
  buyFee: '',
  longTerm: false,
  note: '',
}

const errorsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]))

describe('investmentFormSchema', () => {
  it('accepts a valid purchase and normalizes it', () => {
    const r = investmentFormSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(toInvestmentInput(r.data!)).toEqual({
      coinId: 'bitcoin',
      coinName: 'Bitcoin',
      symbol: 'BTC',
      buyDate: '2024-01-15',
      buyPrice: '42000.50',
      quantity: '0.015',
      buyFee: '0',
      longTerm: false,
      note: null,
    })
  })

  it('requires a coin', () => {
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, coin: null })).coin).toBe('Select a cryptocurrency')
  })

  it.each([
    ['0', 'Buy price must be greater than zero'],
    ['-5', 'Buy price must be a number using digits and a decimal point'],
    ['1e5', 'Buy price must be a number using digits and a decimal point'],
    ['1.1234567890123', 'Buy price allows at most 12 decimal places'],
    ['1234567890123456789', 'Buy price is too large'],
    ['', 'Buy price is required'],
  ])('rejects buy price %j', (buyPrice, message) => {
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, buyPrice })).buyPrice).toBe(message)
  })

  it('rejects zero quantity and too many decimals', () => {
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, quantity: '0' })).quantity).toMatch(/greater than zero/)
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, quantity: '0.1234567890123456789' })).quantity).toMatch(
      /18 decimal places/,
    )
  })

  it('allows a zero fee but not a negative one', () => {
    expect(investmentFormSchema.safeParse({ ...valid, buyFee: '0' }).success).toBe(true)
    expect(investmentFormSchema.safeParse({ ...valid, buyFee: '-1' }).success).toBe(false)
  })

  it('rejects invalid, future and pre-Bitcoin dates', () => {
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, buyDate: '2024-02-30' })).buyDate).toMatch(/valid date/)
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, buyDate: '2999-01-01' })).buyDate).toMatch(/future/)
    expect(errorsOf(investmentFormSchema.safeParse({ ...valid, buyDate: '2008-12-31' })).buyDate).toMatch(/before/)
    expect(investmentFormSchema.safeParse({ ...valid, buyDate: todayIso() }).success).toBe(true)
  })
})

describe('makeInvestmentFormSchema (lot with sales)', () => {
  const schema = makeInvestmentFormSchema({ firstSaleDate: '2024-03-01', soldQuantity: '0.01' })

  it('rejects quantity below what was already sold', () => {
    expect(errorsOf(schema.safeParse({ ...valid, quantity: '0.005' })).quantity).toMatch(/Minimum is 0.01 \(already sold\)/)
    expect(schema.safeParse({ ...valid, quantity: '0.01' }).success).toBe(true)
  })

  it('reports a buy date after the first sale alongside other field errors', () => {
    const errors = errorsOf(schema.safeParse({ ...valid, buyDate: '2024-04-01', buyPrice: '' }))
    expect(errors.buyDate).toMatch(/after the first sale/)
    expect(errors.buyPrice).toMatch(/required/)
  })
})

describe('sale form schema', () => {
  const schema = makeSaleFormSchema({ buyDate: '2024-01-15', remainingQuantity: '0.5' })
  const sale = { soldDate: '2024-03-01', quantity: '0.5', price: '50000', fee: '', note: '' }

  it('accepts selling the full remaining quantity', () => {
    expect(schema.safeParse(sale).success).toBe(true)
  })
  it('rejects selling more than remaining', () => {
    expect(errorsOf(schema.safeParse({ ...sale, quantity: '0.6' })).quantity).toMatch(/at most 0.5/)
  })
  it('rejects a sale before the buy date', () => {
    expect(errorsOf(schema.safeParse({ ...sale, soldDate: '2024-01-14' })).soldDate).toMatch(/before the buy date/)
  })
  it('allows a zero sale price (write-off)', () => {
    expect(schema.safeParse({ ...sale, price: '0' }).success).toBe(true)
  })
})

describe('registerSchema', () => {
  it('requires matching, reasonably strong passwords', () => {
    const base = { email: 'a@b.co', password: 'abcdefg1', confirmPassword: 'abcdefg1' }
    expect(registerSchema.safeParse(base).success).toBe(true)
    expect(registerSchema.safeParse({ ...base, confirmPassword: 'x' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, password: 'short1', confirmPassword: 'short1' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, password: 'nonumbers', confirmPassword: 'nonumbers' }).success).toBe(false)
  })
})

describe('mapDbError', () => {
  it('maps JWT expiry to SessionExpiredError', () => {
    expect(mapDbError({ code: 'PGRST303', message: 'JWT expired' })).toBeInstanceOf(SessionExpiredError)
  })
  it('passes through our own trigger messages only', () => {
    expect(mapDbError({ code: '23514', message: 'Sale quantity exceeds the remaining quantity of this investment' }).message).toBe(
      'Sale quantity exceeds the remaining quantity of this investment.',
    )
    expect(mapDbError({ code: 'XX000', message: 'relation "secret_internal" does not exist' }).message).not.toMatch(/secret/)
  })
  it('explains a missing column as a database that needs the latest migrations', () => {
    const msg = mapDbError({ code: '42703', message: 'column investments.sort_order does not exist' }).message
    expect(msg).toMatch(/supabase\/migrations/)
    expect(msg).not.toMatch(/sort_order/)
  })
})
