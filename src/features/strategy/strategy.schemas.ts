import { z } from 'zod'
import { EARLIEST_BUY_DATE, LIMITS } from '@/lib/constants'
import { parseDate } from '@/lib/formatters'
import { decimalField } from '@/features/investments/investments.schemas'
import type { CycleInput, CycleSettings } from './strategy.types'

export const DEFAULT_CYCLE_DAYS = 30
export const MAX_CYCLE_DAYS = 366
/** Fees are not used in the cycle's calculations: always 0. */
export const DEFAULT_FEE_RATE = '0'

const usd = (label: string) =>
  decimalField({ label, intDigits: LIMITS.priceIntegerDigits, decimals: 2, sign: 'positive' })

export const cycleFormSchema = z.object({
  startDate: z.string().superRefine((value, ctx) => {
    const iso = parseDate(value)
    if (!value) ctx.addIssue({ code: 'custom', message: 'Start date is required' })
    else if (!iso || iso !== value) ctx.addIssue({ code: 'custom', message: 'Start date must be a valid date' })
    else if (iso < EARLIEST_BUY_DATE) ctx.addIssue({ code: 'custom', message: 'Start date is too early' })
  }),
  lengthDays: z.string().superRefine((value, ctx) => {
    const v = value.trim()
    if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > MAX_CYCLE_DAYS) {
      ctx.addIssue({ code: 'custom', message: `Cycle length must be a whole number of days from 1 to ${MAX_CYCLE_DAYS}` })
    }
  }),
  dailyTarget: usd('Daily profit target'),
})

export type CycleFormValues = z.infer<typeof cycleFormSchema>

/** A cycle is set from its dates and daily target; capital is kept as it was (null for new cycles), fee is 0. */
export function toCycleSettings(v: CycleFormValues, capital: string | null = null): CycleSettings {
  return {
    lengthDays: Number(v.lengthDays.trim()),
    capital,
    dailyTarget: v.dailyTarget.trim(),
    feeRate: DEFAULT_FEE_RATE,
  }
}

export function toCycleInput(v: CycleFormValues): CycleInput {
  return { startDate: v.startDate, ...toCycleSettings(v) }
}
