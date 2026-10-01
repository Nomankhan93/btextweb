import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoadingState } from '../components/StateViews'
import { useAuth } from './AuthProvider'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingState label="Checking your session…" />
  if (!user) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return <Outlet />
}
