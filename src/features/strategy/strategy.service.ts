/**
 * Trading cycle persistence (Supabase/PostgREST). Numeric columns are read as text so
 * precision survives JSON; RLS limits every query to the caller's rows.
 */
import { getSupabase } from '@/lib/supabase'
import { mapDbError } from '@/lib/errors'
import { D } from '@/lib/decimal'
import type { CycleInput, CycleSettings, TradingCycle } from './strategy.types'

const COLUMNS = 'id, start_date, length_days, capital::text, daily_target::text, fee_rate::text, closed_on, created_at, updated_at'

interface Row {
  id: string
  start_date: string
  length_days: number
  capital: string | null
  daily_target: string
  fee_rate: string
  closed_on: string | null
  created_at: string
  updated_at: string
}

/** "2000.000000000000" → "2000", "30.500000000000" → "30.5" (exact, via decimal.js). */
const plain = (v: string) => new D(v).toString()

export function mapCycle(r: Row): TradingCycle {
  return {
    id: r.id,
    startDate: r.start_date,
    lengthDays: Number(r.length_days),
    // numeric(30,12) comes back as "2000.000000000000"; keep the value, drop the trailing zeros.
    capital: r.capital === null ? null : plain(r.capital),
    dailyTarget: plain(r.daily_target),
    feeRate: plain(r.fee_rate),
    closedOn: r.closed_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** All cycles, newest first. */
export async function fetchCycles(): Promise<TradingCycle[]> {
  const { data, error } = await getSupabase().from('trading_cycles').select(COLUMNS).order('start_date', { ascending: false })
  if (error) throw mapDbError(error, 'Could not load your trading cycles.')
  return (data as unknown as Row[]).map(mapCycle)
}

/** Starts a cycle; a cycle still running on that date is closed the day before. */
export async function startCycle(input: CycleInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('start_trading_cycle', {
    p_start_date: input.startDate,
    p_length_days: input.lengthDays,
    p_capital: input.capital,
    p_daily_target: input.dailyTarget,
    p_fee_rate: input.feeRate,
  })
  if (error) throw mapDbError(error, 'Could not start the trading cycle.')
  return data as string
}

/** Move a cycle's start date; the database keeps cycles in order and closes an overlapping previous cycle. */
export async function changeCycleStart(id: string, startDate: string): Promise<void> {
  const { error } = await getSupabase().rpc('change_trading_cycle_start', { p_id: id, p_start_date: startDate })
  if (error) throw mapDbError(error, 'Could not change the start date.')
}

/** Delete a cycle's settings (sales are untouched); a previous cycle it closed early is reopened. */
export async function deleteCycle(id: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_trading_cycle', { p_id: id })
  if (error) throw mapDbError(error, 'Could not delete the trading cycle.')
}

export async function updateCycle(id: string, settings: CycleSettings): Promise<void> {
  const { data, error } = await getSupabase()
    .from('trading_cycles')
    .update({
      length_days: settings.lengthDays,
      capital: settings.capital,
      daily_target: settings.dailyTarget,
      fee_rate: settings.feeRate,
    })
    .eq('id', id)
    .select('id')
  if (error) throw mapDbError(error, 'Could not update the trading cycle.')
  if (!data || data.length === 0) throw mapDbError({ code: 'PGRST116' })
}
