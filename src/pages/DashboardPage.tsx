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
  ['Phone Number Foundation', 'Active', 'Pakistan mobile inputs normalize deterministically to canonical E.164 before import.'],
  ['Excel / CSV Import', 'Active', 'CSV/XLSX files can be mapped, previewed and staged per organization without creating final recipients.'],
]

export function DashboardPage() {
  const config = getRuntimeConfig()
  const { user } = useAuth()
  const { currentOrganization, organizations } = useOrganizations()

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText 0.9</p>
          <h1>Excel / CSV Import</h1>
          <p>CSV and XLSX source files can now be parsed, mapped and staged inside the current organization. Final recipient validation, deduplication, consent, suppression and sending remain gated to later phases.</p>
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
          <div><dt>Schema phase</dt><dd>0.9 Excel / CSV import</dd></div>
        </dl>
      </section>
    </div>
  )
}
