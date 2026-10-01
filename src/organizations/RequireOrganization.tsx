import { Navigate, Outlet } from 'react-router-dom'
import { LoadingState } from '../components/StateViews'
import { useOrganizations } from './OrganizationProvider'

export function RequireOrganization() {
  const { currentOrganization, loading } = useOrganizations()

  if (loading) return <LoadingState label="Loading your organizations…" />
  if (!currentOrganization) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
