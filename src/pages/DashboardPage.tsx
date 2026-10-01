import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { getRuntimeConfig } from '../lib/env'

const quickActions = [
  ['Pair or check my phone', '/devices', 'Connect the Android gateway and explicitly select the SIM BulkText may use.'],
  ['Upload recipients', '/imports', 'Import CSV or XLSX recipient data and validate Pakistan mobile numbers.'],
  ['Write a message', '/composer', 'Create a personalized message draft from an eligible recipient snapshot.'],
] as const

export function DashboardPage() {
  const config = getRuntimeConfig()
  const { user } = useAuth()
  const displayName = String(user?.user_metadata?.display_name ?? '').trim()

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">My BulkText</p>
          <h1>{displayName ? `Welcome, ${displayName}` : 'Welcome'}</h1>
          <p>Use your own Android phone and selected SIM to prepare personalized SMS campaigns. Your mobile operator decides package eligibility and actual SMS charges.</p>
        </div>
      </section>

      <section className="metric-grid dashboard-module-grid" aria-label="Quick actions">
        {quickActions.map(([title, href, description]) => (
          <article className="metric-card" key={href}>
            <span>Ready</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <Link className="primary-link" to={href}>Open</Link>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Account</p><h2>Your personal messaging workspace</h2></div>
          <span className="badge badge-success">Private</span>
        </div>
        <dl className="definition-grid">
          <div><dt>Signed-in email</dt><dd>{user?.email ?? 'Unknown'}</dd></div>
          <div><dt>SMS source</dt><dd>Your selected Android SIM</dd></div>
          <div><dt>Package charging</dt><dd>Determined by your mobile operator</dd></div>
        </dl>
      </section>

      {!config.supabaseConfigured ? (
        <section className="notice warning-notice">Supabase is not configured. Set the local environment variables before using account data.</section>
      ) : null}
    </div>
  )
}
