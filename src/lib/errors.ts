/** Session no longer valid (expired / revoked JWT). The app signs out and asks to log in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.')
    this.name = 'SessionExpiredError'
  }
}

/** Optimistic-concurrency conflict: the record changed elsewhere since it was loaded. */
export class ConflictError<T = unknown> extends Error {
  readonly latest: T | null
  constructor(message: string, latest: T | null = null) {
    super(message)
    this.name = 'ConflictError'
    this.latest = latest
  }
}

/** A user-presentable error coming from the API (already sanitized). */
export class AppError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AppError'
  }
}

interface PostgrestLikeError {
  code?: string
  message?: string
  status?: number
}

const SESSION_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303'])

/** Messages raised deliberately by our own database triggers — safe to show verbatim. */
const TRIGGER_MESSAGES = [
  'Sale quantity exceeds the remaining quantity of this investment',
  'Sale date cannot be before the buy date',
  'Buy date cannot be after an existing sale date',
  'Investment not found',
  'Too many investments in one import (maximum 2000)',
  'Too many sales for one investment (maximum 1000)',
  'The list changed in the meantime. Refresh and try again',
]

/**
 * Map a Supabase/PostgREST error to a safe, friendly error. Never forwards raw
 * SQL details (which could leak schema internals) except our own trigger texts.
 */
export function mapDbError(error: PostgrestLikeError | null | undefined, fallback = 'Something went wrong. Please try again.'): Error {
  if (!error) return new AppError(fallback)
  const msg = error.message ?? ''
  if ((error.code && SESSION_CODES.has(error.code)) || /jwt expired/i.test(msg) || error.status === 401) {
    return new SessionExpiredError()
  }
  const known = TRIGGER_MESSAGES.find((m) => msg.includes(m))
  if (known) return new AppError(`${known}.`)
  switch (error.code) {
    case '23514':
      if (msg.includes('investments_sold_quantity_valid')) {
        return new AppError('Quantity cannot be less than the quantity already sold.')
      }
      return new AppError('A value is outside the allowed range.')
    case '23505':
      return new AppError('This record already exists.')
    case '23503':
      return new AppError('The related record no longer exists.')
    case '42501':
      return new AppError('You do not have permission to perform this action.')
    case '22003':
      return new AppError('A number is too large or has too many decimal places.')
    case 'PGRST205':
    case '42P01':
      return new AppError(
        'Database tables not found. Run supabase/migrations/001_initial_schema.sql in the Supabase SQL Editor for this project, then reload.',
      )
    case '42703': // undefined column: the app is newer than the database schema
    case 'PGRST202': // database function not found: the app is newer than the database
      return new AppError(
        'The database is missing a recent update. Run `npm run db:migrate` (or the newest files in supabase/migrations/ in the Supabase SQL Editor), then reload.',
      )
    case 'PGRST116':
      return new AppError('The record was not found. It may have been deleted.')
    default:
      if (/failed to fetch|network/i.test(msg)) return new AppError('Network error — check your connection and try again.')
      return new AppError(fallback)
  }
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
