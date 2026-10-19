import { z } from 'zod'
import { D } from '@/lib/decimal'
import { EARLIEST_BUY_DATE, LIMITS } from '@/lib/constants'
import { formatDate, formatQuantity, todayIso } from '@/lib/formatters'
import type { Investment, InvestmentInput, SaleInput } from './investments.types'

const DECIMAL_RE = /^\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface DecimalRules {
  label: string
  intDigits: number
  decimals: number
  /** 'positive' (> 0) or 'nonnegative' (>= 0) */
  sign: 'positive' | 'nonnegative'
  optional?: boolean
  min?: () => string | null
  minMessage?: (min: string) => string
  max?: () => string | null
  maxMessage?: (max: string) => string
}

/**
 * Validate a user-typed decimal string against the database column precision.
 * Values remain strings so no float rounding happens before the database.
 */
export function decimalField(rules: DecimalRules) {
  return z.string().superRefine((raw, ctx) => {
    const value = raw.trim()
    if (value === '') {
      if (!rules.optional) ctx.addIssue({ code: 'custom', message: `${rules.label} is required` })
      return
    }
    if (!DECIMAL_RE.test(value)) {
      ctx.addIssue({ code: 'custom', message: `${rules.label} must be a number using digits and a decimal point` })
      return
    }
    const [int = '', frac = ''] = value.split('.')
    if (int.replace(/^0+(?=\d)/, '').length > rules.intDigits) {
      ctx.addIssue({ code: 'custom', message: `${rules.label} is too large` })
      return
    }
    if (frac.length > rules.decimals) {
      ctx.addIssue({ code: 'custom', message: `${rules.label} allows at most ${rules.decimals} decimal places` })
      return
    }
    const d = new D(value)
    if (rules.sign === 'positive' && d.lte(0)) {
      ctx.addIssue({ code: 'custom', message: `${rules.label} must be greater than zero` })
      return
    }
    const min = rules.min?.()
    if (min !== null && min !== undefined && d.lt(min)) {
      ctx.addIssue({ code: 'custom', message: rules.minMessage?.(min) ?? `${rules.label} is too small` })
      return
    }
    const max = rules.max?.()
    if (max !== null && max !== undefined && d.gt(max)) {
      ctx.addIssue({ code: 'custom', message: rules.maxMessage?.(max) ?? `${rules.label} is too large` })
    }
  })
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function dateField(
  label: string,
  opts: { min?: () => string; minMessage?: string; max?: () => string | null; maxMessage?: string } = {},
) {
  return z.string().superRefine((value, ctx) => {
    if (!value) return ctx.addIssue({ code: 'custom', message: `${label} is required` })
    if (!isRealDate(value)) return ctx.addIssue({ code: 'custom', message: `${label} must be a valid date` })
    if (value > todayIso()) return ctx.addIssue({ code: 'custom', message: `${label} cannot be in the future` })
    const max = opts.max?.()
    if (max && value > max) {
      return ctx.addIssue({ code: 'custom', message: opts.maxMessage ?? `${label} cannot be after ${formatDate(max)}` })
    }
    const min = opts.min?.() ?? EARLIEST_BUY_DATE
    if (value < min) {
      ctx.addIssue({ code: 'custom', message: opts.minMessage ?? `${label} cannot be before ${formatDate(min)}` })
    }
  })
}

const coinSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/, 'Invalid coin'),
  name: z.string().min(1).max(200),
  symbol: z.string().min(1).max(50),
})

/**
 * Form schema for a specific lot. When editing a lot that already has sales, the buy date
 * may not move past the first sale date (a sale can never be dated before its purchase)
 * and the quantity may not drop below what was already sold. Both are per-field rules so
 * they show alongside other field errors.
 */
export function makeInvestmentFormSchema(opts: { firstSaleDate?: string | null; soldQuantity?: string | null } = {}) {
  const first = opts.firstSaleDate || null
  const sold = opts.soldQuantity && new D(opts.soldQuantity).gt(0) ? opts.soldQuantity : null
  return z.object({
    coin: coinSchema.nullable().transform((c, ctx) => {
      if (c === null) {
        ctx.addIssue({ code: 'custom', message: 'Select a cryptocurrency' })
        return z.NEVER
      }
      return c
    }),
    buyDate: dateField('Buy date', {
      max: () => first,
      maxMessage: first ? `Buy date can't be after the first sale (${formatDate(first)})` : undefined,
    }),
    buyPrice: decimalField({
      label: 'Buy price',
      intDigits: LIMITS.priceIntegerDigits,
      decimals: LIMITS.priceDecimals,
      sign: 'positive',
    }),
    quantity: decimalField({
      label: 'Quantity',
      intDigits: LIMITS.quantityIntegerDigits,
      decimals: LIMITS.quantityDecimals,
      sign: 'positive',
      min: () => sold,
      minMessage: (min) => `Minimum is ${formatQuantity(min)} (already sold)`,
    }),
    buyFee: decimalField({
      label: 'Fee',
      intDigits: LIMITS.priceIntegerDigits,
      decimals: LIMITS.priceDecimals,
      sign: 'nonnegative',
      optional: true,
    }),
    longTerm: z.boolean(),
    note: z.string().max(LIMITS.noteMax, `Note must be at most ${LIMITS.noteMax} characters`),
  })
}

export const investmentFormSchema = makeInvestmentFormSchema()

export type InvestmentFormInput = z.input<typeof investmentFormSchema>
export type InvestmentFormValues = z.output<typeof investmentFormSchema>

export function defaultInvestmentValues(inv?: Investment): InvestmentFormInput {
  if (!inv) return { coin: null, buyDate: todayIso(), buyPrice: '', quantity: '', buyFee: '', longTerm: false, note: '' }
  return {
    coin: { id: inv.coinId, name: inv.coinName, symbol: inv.symbol },
    buyDate: inv.buyDate,
    buyPrice: new D(inv.buyPrice).toFixed(),
    quantity: new D(inv.quantity).toFixed(),
    buyFee: new D(inv.buyFee).isZero() ? '' : new D(inv.buyFee).toFixed(),
    longTerm: inv.longTerm,
    note: inv.note ?? '',
  }
}

export function toInvestmentInput(v: InvestmentFormValues): InvestmentInput {
  return {
    coinId: v.coin.id,
    coinName: v.coin.name,
    symbol: v.coin.symbol.toUpperCase(),
    buyDate: v.buyDate,
    buyPrice: v.buyPrice.trim(),
    quantity: v.quantity.trim(),
    buyFee: v.buyFee.trim() || '0',
    longTerm: v.longTerm,
    note: v.note.trim() || null,
  }
}

/** Sale form schema depends on the lot being sold. */
export function makeSaleFormSchema(lot: { buyDate: string; remainingQuantity: string }) {
  return z.object({
    soldDate: dateField('Sale date', {
      min: () => lot.buyDate,
      minMessage: `Sale date cannot be before the buy date (${formatDate(lot.buyDate)})`,
    }),
    quantity: decimalField({
      label: 'Quantity sold',
      intDigits: LIMITS.quantityIntegerDigits,
      decimals: LIMITS.quantityDecimals,
      sign: 'positive',
      max: () => lot.remainingQuantity,
      maxMessage: (max) => `Maximum is ${formatQuantity(max)} (quantity held)`,
    }),
    price: decimalField({
      label: 'Sale price',
      intDigits: LIMITS.priceIntegerDigits,
      decimals: LIMITS.priceDecimals,
      sign: 'nonnegative',
    }),
    fee: decimalField({
      label: 'Fee',
      intDigits: LIMITS.priceIntegerDigits,
      decimals: LIMITS.priceDecimals,
      sign: 'nonnegative',
      optional: true,
    }),
    note: z.string().max(LIMITS.saleNoteMax, `Note must be at most ${LIMITS.saleNoteMax} characters`),
  })
}

export type SaleFormValues = z.infer<ReturnType<typeof makeSaleFormSchema>>

export function toSaleInput(investmentId: string, v: SaleFormValues): SaleInput {
  return {
    investmentId,
    soldDate: v.soldDate,
    quantity: v.quantity.trim(),
    price: v.price.trim(),
    fee: v.fee.trim() || '0',
    note: v.note.trim() || null,
  }
}

export const noteFormSchema = z.object({
  note: z.string().max(LIMITS.noteMax, `Note must be at most ${LIMITS.noteMax} characters`),
})
