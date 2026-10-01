import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { roleLabels } from '../lib/rbac'
import { useOrganizations } from '../organizations/OrganizationProvider'

const navigation = [
  ['Dashboard', '/dashboard'],
  ['Campaigns', '/campaigns'],
  ['Contacts', '/contacts'],
  ['Consent & Suppression', '/consent-suppression'],
  ['Imports', '/imports'],
  ['Devices', '/devices'],
  ['Templates', '/templates'],
  ['Reports', '/reports'],
  ['Subscription', '/subscription'],
  ['Team', '/team'],
  ['Settings', '/settings'],
] as const

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { organizations, currentOrganization, switchOrganization } = useOrganizations()
  const navigate = useNavigate()

  async function logout() {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="menu-button" type="button" aria-label="Toggle navigation" onClick={() => setMenuOpen((value) => !value)}>☰</button>
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">BT</div>
          <div><strong>BulkText</strong><span>SIM-powered business messaging</span></div>
        </div>

        <div className="topbar-actions">
          {currentOrganization ? (
            <label className="organization-switcher">
              <span className="sr-only">Current organization</span>
              <select value={currentOrganization.id} onChange={(e) => switchOrganization(e.target.value)}>
                {organizations.map((org) => <option key={org.id} value={org.id}>{org.name} · {roleLabels[org.role]}</option>)}
              </select>
            </label>
          ) : null}
          <span className="environment-pill">Consent Gate 0.11</span>
          <div className="account-menu">
            <span title={user?.email ?? ''}>{user?.email ?? 'Account'}</span>
            <button className="text-button" type="button" onClick={() => void logout()}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
          <nav>
            {navigation.map(([label, href]) => (
              <NavLink key={href} to={href} onClick={() => setMenuOpen(false)} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer"><span className="status-dot" />Tenant isolation active. Consent evidence, suppression state and immutable recipient eligibility snapshots are enabled; campaign sending remains gated.</div>
        </aside>

        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
