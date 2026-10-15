import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { onSessionExpired } from '@/lib/query-client'
import { signOut as signOutRequest } from './auth.service'
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth.context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const [isPasswordRecovery, setPasswordRecovery] = useState(false)
  const manualSignOut = useRef(false)
  const currentUserId = useRef<string | null>(null)

  const applySession = useCallback(
    (next: Session | null) => {
      const nextId = next?.user.id ?? null
      // Never let one user's cached data leak into another user's session.
      if (currentUserId.current !== nextId) {
        if (currentUserId.current !== null) queryClient.clear()
        currentUserId.current = nextId
      }
      setSession(next)
      setStatus(next ? 'authenticated' : 'unauthenticated')
    },
    [queryClient],
  )

  useEffect(() => {
    const supabase = getSupabase()
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => active && applySession(data.session))
      .catch(() => active && applySession(null))

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
      if (event === 'SIGNED_OUT') {
        if (!manualSignOut.current && currentUserId.current) {
          setNotice('Your session has expired. Please sign in again.')
        }
        manualSignOut.current = false
        setPasswordRecovery(false)
      }
      applySession(next)
    })

    const unsubscribeExpired = onSessionExpired(() => {
      setNotice('Your session has expired. Please sign in again.')
      void supabase.auth.signOut({ scope: 'local' })
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
      unsubscribeExpired()
    }
  }, [applySession])

  const signOut = useCallback(async () => {
    manualSignOut.current = true
    setNotice(null)
    try {
      await signOutRequest()
    } finally {
      queryClient.clear()
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      notice,
      clearNotice: () => setNotice(null),
      isPasswordRecovery,
      signOut,
    }),
    [status, session, notice, isPasswordRecovery, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
