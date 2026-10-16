import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { LoadingState } from '@/components/ui/LoadingState'
import { AuthGuard, GuestOnly } from '@/features/auth/AuthGuard'
import { useAuth } from '@/features/auth/auth.context'
import { LoginPage, RegisterPage } from '@/features/auth/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/PasswordResetPages'

// The authenticated app is code-split so the login screen loads quickly.
const DashboardLayout = lazy(() => import('@/features/dashboard/DashboardLayout').then((m) => ({ default: m.DashboardLayout })))
const OverviewPage = lazy(() => import('@/features/dashboard/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const HoldingsPage = lazy(() => import('@/features/dashboard/HoldingsPage').then((m) => ({ default: m.HoldingsPage })))
const InvestmentsPage = lazy(() => import('@/features/investments/InvestmentsPage').then((m) => ({ default: m.InvestmentsPage })))
const NotesPage = lazy(() => import('@/features/notes/NotesPage').then((m) => ({ default: m.NotesPage })))

const page = (el: ReactNode) => <Suspense fallback={<LoadingState label="Loading…" />}>{el}</Suspense>

export function AppRoutes() {
  const { isPasswordRecovery } = useAuth()
  const { pathname } = useLocation()

  // A recovery link can land on another page (e.g. Supabase's Site URL fallback); always finish on the reset form.
  if (isPasswordRecovery && pathname !== '/reset-password') return <Navigate to="/reset-password" replace />

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      {/* Reachable with the temporary session created by a recovery link. */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AuthGuard />}>
        <Route
          element={
            <Suspense fallback={<LoadingState label="Loading dashboard…" fullScreen />}>
              <DashboardLayout />
            </Suspense>
          }
        >
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={page(<OverviewPage />)} />
          <Route path="/holdings" element={page(<HoldingsPage />)} />
          <Route path="/investments" element={page(<InvestmentsPage />)} />
          <Route path="/notes" element={page(<NotesPage />)} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
