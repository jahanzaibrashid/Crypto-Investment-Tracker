import type { AuthError } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { AppError } from '@/lib/errors'

/** Translate Supabase Auth errors into friendly messages without leaking internals. */
export function friendlyAuthError(error: AuthError | Error | null | undefined): AppError {
  const code = (error as AuthError | undefined)?.code
  const msg = error?.message ?? ''
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return new AppError('Incorrect email or password.')
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return new AppError('Please confirm your email address first — check your inbox for the confirmation link.')
  }
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return new AppError('An account with this email already exists. Try signing in instead.')
  }
  if (code === 'weak_password' || /password should/i.test(msg)) {
    return new AppError('That password is too weak. Use at least 8 characters with letters and numbers.')
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) {
    return new AppError('Too many attempts. Please wait a minute and try again.')
  }
  if (code === 'same_password') return new AppError('The new password must be different from the current one.')
  if (/failed to fetch|network/i.test(msg)) return new AppError('Network error — check your connection and try again.')
  return new AppError('Authentication failed. Please try again.')
}

function redirectUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password })
  if (error) throw friendlyAuthError(error)
}

/** Returns true when the account needs email confirmation before signing in. */
export async function signUp(email: string, password: string, displayName?: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl('/login'),
      data: displayName ? { display_name: displayName } : undefined,
    },
  })
  if (error) throw friendlyAuthError(error)
  return { needsConfirmation: !data.session }
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' })
  if (error) throw friendlyAuthError(error)
}

export async function requestPasswordReset(email: string) {
  const { error } = await getSupabase().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl('/reset-password') })
  if (error) throw friendlyAuthError(error)
}

export async function updatePassword(password: string) {
  const { error } = await getSupabase().auth.updateUser({ password })
  if (error) throw friendlyAuthError(error)
}
