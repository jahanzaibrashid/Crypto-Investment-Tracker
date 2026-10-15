import Decimal from 'decimal.js'

/**
 * Isolated Decimal constructor for money/quantity math. 40 significant digits
 * comfortably covers NUMERIC(36,18) quantities times NUMERIC(30,12) prices.
 * Values are rounded only for display/export, never mid-calculation.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export type Dec = InstanceType<typeof D>

export const ZERO = new D(0)
export const HUNDRED = new D(100)

export function dec(value: string | number | Dec | null | undefined): Dec {
  if (value === null || value === undefined || value === '') return ZERO
  return new D(value)
}

export function sum(values: Iterable<Dec>): Dec {
  let total = ZERO
  for (const v of values) total = total.plus(v)
  return total
}
