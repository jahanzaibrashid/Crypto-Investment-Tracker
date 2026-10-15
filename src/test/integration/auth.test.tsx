import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { AuthGuard, GuestOnly } from '@/features/auth/AuthGuard'
import { LoginPage, RegisterPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/PasswordResetPages'
import { AppError } from '@/lib/errors'
import * as authService from '@/features/auth/auth.service'
import { makeAuth, renderWithProviders } from '../render'

vi.mock('@/features/auth/auth.service', () => ({
  signIn: vi.fn(async () => {}),
  signUp: vi.fn(async () => ({ needsConfirmation: true })),
  signOut: vi.fn(async () => {}),
  requestPasswordReset: vi.fn(async () => {}),
  updatePassword: vi.fn(async () => {}),
}))

function TestRoutes() {
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AuthGuard />}>
        <Route path="/" element={<h1>Private dashboard</h1>} />
      </Route>
    </Routes>
  )
}

describe('protected routes', () => {
  it('redirects unauthenticated users from the dashboard to login', async () => {
    renderWithProviders(<TestRoutes />, { route: '/', auth: makeAuth({ status: 'unauthenticated' }) })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument()
  })

  it('shows a loading state while the session is being restored', () => {
    renderWithProviders(<TestRoutes />, { route: '/', auth: makeAuth({ status: 'loading' }) })
    expect(screen.getByRole('status')).toHaveTextContent('Checking your session')
    expect(screen.queryByText('Private dashboard')).not.toBeInTheDocument()
  })

  it('lets authenticated users in, and sends them away from /login', async () => {
    renderWithProviders(<TestRoutes />, { route: '/login', auth: makeAuth() })
    expect(await screen.findByText('Private dashboard')).toBeInTheDocument()
  })

  it('explains an expired session on the login page', async () => {
    renderWithProviders(<TestRoutes />, {
      route: '/login',
      auth: makeAuth({ status: 'unauthenticated', notice: 'Your session has expired. Please sign in again.' }),
    })
    expect(await screen.findByText('Your session has expired. Please sign in again.')).toBeInTheDocument()
  })
})

describe('login', () => {
  it('validates the form before calling Supabase', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/login', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(authService.signIn).not.toHaveBeenCalled()
  })

  it('signs in with the entered credentials', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/login', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.type(screen.getByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(authService.signIn).toHaveBeenCalledWith('alice@example.com', 'secret123'))
  })

  it('shows a friendly error on bad credentials', async () => {
    vi.mocked(authService.signIn).mockRejectedValueOnce(new AppError('Incorrect email or password.'))
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/login', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.type(screen.getByLabelText('Email'), 'alice@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })
})

describe('registration and password reset', () => {
  it('registers and asks the user to confirm their email', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/register', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'abcdefg1')
    await user.type(screen.getByLabelText('Confirm password'), 'abcdefg1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText(/We sent a confirmation link/)).toBeInTheDocument()
    expect(authService.signUp).toHaveBeenCalledWith('new@example.com', 'abcdefg1', undefined)
  })

  it('rejects mismatched passwords', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/register', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'abcdefg1')
    await user.type(screen.getByLabelText('Confirm password'), 'abcdefg2')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(authService.signUp).not.toHaveBeenCalled()
  })

  it('requests a reset link without revealing whether the account exists', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/forgot-password', auth: makeAuth({ status: 'unauthenticated' }) })
    await user.type(screen.getByLabelText('Email'), 'who@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByText(/If an account exists for that email/)).toBeInTheDocument()
    expect(authService.requestPasswordReset).toHaveBeenCalledWith('who@example.com')
  })

  it('reset page rejects an invalid/expired link (no recovery session)', async () => {
    renderWithProviders(<TestRoutes />, { route: '/reset-password', auth: makeAuth({ status: 'unauthenticated' }) })
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument()
  })

  it('reset page updates the password for a recovery session', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TestRoutes />, { route: '/reset-password', auth: makeAuth({ isPasswordRecovery: true }) })
    await user.type(screen.getByLabelText('New password'), 'newpass12')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass12')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    await waitFor(() => expect(authService.updatePassword).toHaveBeenCalledWith('newpass12'))
    expect(await screen.findByText('Private dashboard')).toBeInTheDocument()
  })
})
