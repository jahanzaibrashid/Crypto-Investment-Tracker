import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session, User } from '@supabase/supabase-js'
import { ToastProvider } from '@/components/ui/Toast'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth.context'

export const TEST_USER = { id: 'user-a', email: 'alice@example.com' } as User

export function makeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const authenticated = overrides.status !== 'unauthenticated' && overrides.status !== 'loading'
  return {
    status: 'authenticated',
    session: authenticated ? ({ user: TEST_USER } as Session) : null,
    user: authenticated ? TEST_USER : null,
    notice: null,
    clearNotice: () => {},
    isPasswordRecovery: false,
    signOut: async () => {},
    ...overrides,
  }
}

export function renderWithProviders(ui: ReactElement, opts: { auth?: AuthContextValue; route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  const result = render(
    <MemoryRouter initialEntries={[opts.route ?? '/']}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthContext.Provider value={opts.auth ?? makeAuth()}>{ui}</AuthContext.Provider>
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { ...result, queryClient }
}
