import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { primaryNavigation } from '../lib/productNavigation'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
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
          <div className="account-menu">
            <span title={user?.email ?? ''}>{user?.email ?? 'Account'}</span>
            <button className="text-button" type="button" onClick={() => void logout()}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Primary navigation">
          <nav>
            {primaryNavigation.map(({ label, href }) => (
              <NavLink key={href} to={href} onClick={() => setMenuOpen(false)} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="content"><Outlet /></main>
      </div>
    </div>
  )
}
