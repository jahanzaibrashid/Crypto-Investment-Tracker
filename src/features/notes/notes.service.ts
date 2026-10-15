import { getSupabase } from '@/lib/supabase'
import { ConflictError, mapDbError } from '@/lib/errors'

export interface PortfolioNote {
  note: string
  /** Incremented by the database on every update; used for optimistic concurrency. */
  version: number
  updatedAt: string
}

const COLUMNS = 'note, version, updated_at'

interface Row {
  note: string
  version: number
  updated_at: string
}

const map = (r: Row): PortfolioNote => ({ note: r.note, version: r.version, updatedAt: r.updated_at })

export async function fetchPortfolioNote(): Promise<PortfolioNote> {
  const sb = getSupabase()
  const { data, error } = await sb.from('portfolio_notes').select(COLUMNS).maybeSingle()
  if (error) throw mapDbError(error, 'Could not load the portfolio note.')
  if (data) return map(data as Row)

  // Normally created by the signup trigger; create it for accounts that predate it.
  const { data: created, error: insertError } = await sb.from('portfolio_notes').insert({ note: '' }).select(COLUMNS).single()
  if (!insertError && created) return map(created as Row)
  if (insertError && insertError.code !== '23505') throw mapDbError(insertError, 'Could not create the portfolio note.')
  const { data: again, error: againError } = await sb.from('portfolio_notes').select(COLUMNS).single()
  if (againError) throw mapDbError(againError, 'Could not load the portfolio note.')
  return map(again as Row)
}

/**
 * Save only if nobody else has saved since `expectedVersion` was loaded.
 * On conflict, throws ConflictError carrying the latest saved note.
 */
export async function savePortfolioNote(note: string, expectedVersion: number): Promise<PortfolioNote> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('portfolio_notes')
    .update({ note })
    .eq('version', expectedVersion)
    .select(COLUMNS)
  if (error) throw mapDbError(error, 'Could not save the portfolio note.')
  if (data && data.length === 1) return map(data[0] as Row)
  const latest = await fetchPortfolioNote()
  throw new ConflictError<PortfolioNote>('This note was changed on another device.', latest)
}
