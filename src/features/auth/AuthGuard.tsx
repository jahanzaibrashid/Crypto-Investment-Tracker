import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadingState } from '@/components/ui/LoadingState'
import { useAuth } from './auth.context'

/** Only authenticated users may render nested routes; others go to /login. */
export function AuthGuard() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <LoadingState label="Checking your session…" fullScreen />
  if (status === 'unauthenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Login/register pages: authenticated users are sent to the dashboard. */
export function GuestOnly() {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingState label="Checking your session…" fullScreen />
  if (status === 'authenticated') return <Navigate to="/" replace />
  return <Outlet />
}
