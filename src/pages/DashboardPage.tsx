import { getRuntimeConfig } from '../lib/env'
import { useAuth } from '../auth/AuthProvider'
import { useOrganizations } from '../organizations/OrganizationProvider'

const modules = [
  ['Android Gateway', 'Validated', 'Selected-SIM sending feasibility passed on physical hardware.'],
  ['Authentication', 'Active', 'Supabase Auth protects the application shell and account recovery.'],
  ['Organizations & RBAC', 'Active', 'Tenant-scoped memberships and backend role checks are enabled.'],
  ['Secure Pairing', 'Active', 'One-use codes and device-scoped gateway credentials are enabled.'],
  ['Device Dashboard', 'Active', 'Gateway health, Android metadata and reported SIM inventory are visible.'],
  ['SIM Binding', 'Active', 'Owner/Admin explicitly selects a present subscription with no silent fallback.'],
]

export function DashboardPage() {
  const config = getRuntimeConfig()
  const { user } = useAuth()
  const { currentOrganization, organizations } = useOrganizations()

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText 0.7</p>
          <h1>Device Dashboard &amp; SIM Binding</h1>
          <p>Paired Android gateways can now report hardware and SIM inventory. Organization Owners/Admins explicitly bind the subscription BulkText may use; campaign sending remains disabled until the later recipient, preflight and durable queue phases.</p>
        </div>
      </section>

      <section className="metric-grid dashboard-module-grid" aria-label="Patch status">
        {modules.map(([title, status, description]) => (
          <article className="metric-card" key={title}><span>{status}</span><h2>{title}</h2><p>{description}</p></article>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Current workspace</p><h2>{currentOrganization?.name ?? 'No organization selected'}</h2></div>
          <span className="badge badge-success">Tenant protected</span>
        </div>
        <dl className="definition-grid">
          <div><dt>Signed-in user</dt><dd>{user?.email ?? 'Unknown'}</dd></div>
          <div><dt>Your role</dt><dd>{currentOrganization?.role.replace('_', ' ') ?? '—'}</dd></div>
          <div><dt>Organizations</dt><dd>{organizations.length}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Environment</p><h2>Supabase configuration</h2></div>
          <span className={config.supabaseConfigured ? 'badge badge-success' : 'badge badge-warning'}>{config.supabaseConfigured ? 'Configured' : 'Not configured'}</span>
        </div>
        <dl className="definition-grid">
          <div><dt>App environment</dt><dd>{config.appEnvironment}</dd></div>
          <div><dt>Supabase URL</dt><dd>{config.supabaseUrl ?? 'Set VITE_SUPABASE_URL'}</dd></div>
          <div><dt>Schema phase</dt><dd>0.7 device dashboard + SIM binding</dd></div>
        </dl>
      </section>
    </div>
  )
}
