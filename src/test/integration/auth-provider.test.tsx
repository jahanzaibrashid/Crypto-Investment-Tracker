import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { useAuth } from '@/features/auth/auth.context'

type Listener = (event: AuthChangeEvent, session: Session | null) => void
const auth = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: unknown) => void),
  session: null as unknown,
}))

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (cb: Listener) => {
        auth.listener = cb as never
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: async () => ({ error: null }),
    },
  }),
}))

const session = (id: string) => ({ user: { id, email: `${id}@example.com` } }) as unknown as Session

function Probe() {
  const { status, user, notice } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.id ?? 'none'}</span>
      <span data-testid="notice">{notice ?? ''}</span>
    </div>
  )
}

function setup(initial: Session | null) {
  auth.session = initial
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return client
}

describe('AuthProvider', () => {
  it('restores a persisted session', async () => {
    setup(session('alice'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
  })

  it("clears cached data when the account changes so one user's data never shows for another", async () => {
    const client = setup(session('alice'))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice'))
    client.setQueryData(['investments', 'alice'], [{ id: 'secret' }])

    act(() => auth.listener!('SIGNED_IN', session('bob')))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('bob'))
    expect(client.getQueryData(['investments', 'alice'])).toBeUndefined()
  })

  it('explains an unexpected sign-out (expired session)', async () => {
    const client = setup(session('alice'))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('alice'))
    client.setQueryData(['investments', 'alice'], [{ id: 'secret' }])

    act(() => auth.listener!('SIGNED_OUT', null))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(screen.getByTestId('notice')).toHaveTextContent('Your session has expired')
    expect(client.getQueryData(['investments', 'alice'])).toBeUndefined()
  })
})
