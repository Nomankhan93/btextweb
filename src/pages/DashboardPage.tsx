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
  ['Recipient Validation & Preview', 'Active', 'Valid unique recipients can be selected into immutable server-authoritative preview revisions.'],
  ['Consent & Suppression', 'Active', 'Append-only consent evidence and organization suppression events feed an authoritative recipient eligibility gate.'],
  ['Message Composer & Personalization', 'Active', 'Eligible snapshots can be drafted with built-in/custom variables and recipient-specific missing-value previews.'],
]

export function DashboardPage() {
  const config = getRuntimeConfig()
  const { user } = useAuth()
  const { currentOrganization, organizations } = useOrganizations()

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">BulkText 0.12</p>
          <h1>Message Composer & Personalization</h1>
          <p>Immutable eligibility snapshots can now feed editable message drafts with built-in and custom personalization variables plus live recipient rendering. SMS segment calculation, campaign confirmation and sending remain gated to later phases.</p>
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
          <div><dt>Schema phase</dt><dd>0.12 Message composer & personalization</dd></div>
        </dl>
      </section>
    </div>
  )
}
