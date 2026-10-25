import type { DecimalString } from '@/features/investments/investments.types'

/** One profit-target period (supabase/migrations/008_trading_cycles.sql). */
export interface TradingCycle {
  id: string
  startDate: string
  lengthDays: number
  /** Capital allocated to trading, USD; null when not set (optional since migration 010). */
  capital: DecimalString | null
  /** Base daily profit target, USD. */
  dailyTarget: DecimalString
  /** Assumed fee per trade side in percent (0.1 = 0.1%); projections only. */
  feeRate: DecimalString
  /** Set when a newer cycle started before this one ran its full length. */
  closedOn: string | null
  createdAt: string
  updatedAt: string
}

export interface CycleInput {
  startDate: string
  lengthDays: number
  capital: DecimalString | null
  dailyTarget: DecimalString
  feeRate: DecimalString
}

/** Editable after a cycle starts (the start date is fixed). */
export type CycleSettings = Omit<CycleInput, 'startDate'>
