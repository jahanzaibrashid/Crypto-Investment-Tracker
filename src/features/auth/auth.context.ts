import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  user: User | null
  /** Set after an unexpected sign-out (e.g. expired session) so the login page can explain it. */
  notice: string | null
  clearNotice: () => void
  /** True after the user followed a password-recovery email link. */
  isPasswordRecovery: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in user's id; only valid inside AuthGuard. */
export function useUserId(): string {
  const { user } = useAuth()
  if (!user) throw new Error('useUserId called without an authenticated user')
  return user.id
}
