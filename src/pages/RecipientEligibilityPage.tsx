import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { blockReasonLabel, consentStateLabel, summarizeEligibility } from '../lib/consentSuppression'
import {
  createRecipientEligibilitySnapshot,
  getRecipientEligibilitySnapshotRows,
  listRecipientEligibilityRows,
  listRecipientEligibilitySnapshots,
  type RecipientEligibilityRow,
  type RecipientEligibilitySnapshotSummary,
  type StoredEligibilityRow,
} from '../lib/consentSuppressionApi'
import { errorMessage } from '../lib/errors'
import { canManageCampaigns } from '../lib/rbac'
import { useOrganizations } from '../organizations/OrganizationProvider'

function dateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function RecipientEligibilityPage() {
  const { previewId = '' } = useParams()
  const { currentOrganization } = useOrganizations()
  const [rows, setRows] = useState<RecipientEligibilityRow[]>([])
  const [snapshots, setSnapshots] = useState<RecipientEligibilitySnapshotSummary[]>([])
  const [storedRows, setStoredRows] = useState<StoredEligibilityRow[]>([])
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canCreate = canManageCampaigns(currentOrganization?.role)

  const summary = useMemo(() => summarizeEligibility(rows), [rows])

  const refresh = useCallback(async () => {
    if (!currentOrganization || !previewId) return
    setLoading(true)
    setError(null)
    try {
      const [nextRows, nextSnapshots] = await Promise.all([
        listRecipientEligibilityRows(currentOrganization.id, previewId),
        listRecipientEligibilitySnapshots(currentOrganization.id, previewId),
      ])
      setRows(nextRows)
      setSnapshots(nextSnapshots)
      setStoredRows([])
      setActiveSnapshotId(null)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not evaluate consent and suppression for this preview.'))
    } finally {
      setLoading(false)
    }
  }, [currentOrganization, previewId])

  useEffect(() => { void refresh() }, [refresh])

  async function saveSnapshot() {
    if (!currentOrganization || !previewId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const snapshotId = await createRecipientEligibilitySnapshot(currentOrganization.id, previewId)
      const [nextRows, nextSnapshots, nextStored] = await Promise.all([
        listRecipientEligibilityRows(currentOrganization.id, previewId),
        listRecipientEligibilitySnapshots(currentOrganization.id, previewId),
        getRecipientEligibilitySnapshotRows(currentOrganization.id, snapshotId),
      ])
      setRows(nextRows)
      setSnapshots(nextSnapshots)
      setStoredRows(nextStored)
      setActiveSnapshotId(snapshotId)
      setMessage('Consent/suppression eligibility snapshot created. This snapshot is immutable and still does not send SMS.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not create eligibility snapshot.'))
    } finally {
      setBusy(false)
    }
  }

  async function viewSnapshot(snapshotId: string) {
    if (!currentOrganization) return
    setBusy(true)
    setError(null)
    try {
      setStoredRows(await getRecipientEligibilitySnapshotRows(currentOrganization.id, snapshotId))
      setActiveSnapshotId(snapshotId)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load eligibility snapshot rows.'))
    } finally {
      setBusy(false)
    }
  }

  if (!currentOrganization) return null
  if (loading) return <LoadingState label="Evaluating consent and suppression…" />

  const sourceFilename = rows[0]?.sourceFilename ?? 'Recipient preview'
  const previewRevision = rows[0]?.previewRevision ?? 0

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">BulkText 0.11</p>
          <h1>Consent & Suppression Gate</h1>
          <p>Evaluate structurally included recipients against current consent evidence and the organization suppression list, then freeze the result as an immutable eligibility snapshot.</p>
        </div>
        <Link className="secondary-button compact-button" to="/imports">Back to imports</Link>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Recipient preview</p><h2>{sourceFilename}{previewRevision ? ` · preview #${previewRevision}` : ''}</h2></div><span className="badge badge-muted">consent-suppression-v1</span></div>
        <p className="muted-copy">Suppression always overrides consent. A recipient with no active consent evidence, revoked consent or expired consent is blocked even when the number is not suppressed.</p>
      </section>

      <section className="metric-grid eligibility-metrics">
        <article className="metric-card"><span>Candidates</span><h2>{summary.total}</h2><p>Included rows from the immutable recipient preview.</p></article>
        <article className="metric-card"><span>Eligible</span><h2>{summary.eligible}</h2><p>Active consent and no suppression.</p></article>
        <article className="metric-card"><span>Consent blocked</span><h2>{summary.noConsent + summary.revoked + summary.expired}</h2><p>{summary.noConsent} none · {summary.revoked} revoked · {summary.expired} expired</p></article>
        <article className="metric-card"><span>Suppressed</span><h2>{summary.suppressed}</h2><p>Organization suppression list overrides consent.</p></article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Live evaluation</p><h2>Current compliance state</h2></div>
          <div className="recipient-actions"><button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button>{canCreate ? <button className="primary-button compact-button" type="button" disabled={busy || rows.length === 0} onClick={() => void saveSnapshot()}>{busy ? 'Saving…' : 'Create eligibility snapshot'}</button> : null}</div>
        </div>
        {!canCreate ? <div className="notice warning-notice">Your role can inspect eligibility and stored snapshots, but only Owner, Admin and Campaign Manager can create a new eligibility snapshot.</div> : null}
        {rows.length === 0 ? <EmptyState title="No included recipients">The selected recipient preview contains no included candidates.</EmptyState> : (
          <div className="table-wrap"><table className="data-table eligibility-table"><thead><tr><th>Row</th><th>Name</th><th>Number</th><th>Consent</th><th>Suppression</th><th>Eligibility</th><th /></tr></thead><tbody>{rows.map((row) => (
            <tr key={row.previewRowId} className={row.eligibilityState === 'eligible' ? 'recipient-row-included' : ''}>
              <td>{row.sourceRowNumber}</td>
              <td>{row.displayName ?? '—'}</td>
              <td><code>{row.normalizedE164}</code></td>
              <td><strong>{consentStateLabel(row.consentState)}</strong><small>{row.consentSource ? `${row.consentSource.replaceAll('_', ' ')} · ${dateTime(row.consentOccurredAt)}` : 'No evidence'}</small>{row.consentExpiresAt ? <small>Expires {dateTime(row.consentExpiresAt)}</small> : null}</td>
              <td><span className={row.suppressionState === 'suppressed' ? 'badge badge-warning' : 'badge badge-success'}>{row.suppressionState}</span><small>{row.suppressionReason?.replaceAll('_', ' ') ?? '—'}</small></td>
              <td><span className={row.eligibilityState === 'eligible' ? 'badge badge-success' : 'badge badge-warning'}>{row.eligibilityState}</span><small>{blockReasonLabel(row.blockReason)}</small></td>
              <td><Link className="secondary-button compact-button" to={`/consent-suppression?phone=${encodeURIComponent(row.normalizedE164)}`}>Manage</Link></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Snapshot history</p><h2>Eligibility revisions</h2></div><span className="badge badge-muted">Immutable</span></div>
        {snapshots.length === 0 ? <EmptyState title="No eligibility snapshots">After consent and suppression records are ready, create a snapshot to freeze the current gate result.</EmptyState> : (
          <div className="table-wrap"><table className="data-table eligibility-history-table"><thead><tr><th>Revision</th><th>Eligible</th><th>Blocked breakdown</th><th>Created</th><th /></tr></thead><tbody>{snapshots.map((snapshot) => (
            <tr key={snapshot.snapshotId}><td><strong>#{snapshot.revision}</strong><small>{snapshot.policyVersion}</small></td><td><span className="badge badge-success">{snapshot.eligibleRows} eligible</span><small>{snapshot.candidateRows} candidates</small></td><td>{snapshot.noConsentRows} no consent · {snapshot.consentRevokedRows} revoked · {snapshot.consentExpiredRows} expired · {snapshot.suppressedRows} suppressed</td><td>{dateTime(snapshot.createdAt)}</td><td><button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void viewSnapshot(snapshot.snapshotId)}>{activeSnapshotId === snapshot.snapshotId ? 'Viewing' : 'View'}</button></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      {activeSnapshotId ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Stored snapshot</p><h2>Frozen eligibility decisions</h2></div><div className="recipient-actions"><span className="badge badge-success">{storedRows.filter((row) => row.eligibilityState === 'eligible').length} eligible</span><Link className="primary-button compact-button" to={`/composer?snapshot=${encodeURIComponent(activeSnapshotId)}`}>Compose message</Link></div></div>
          <div className="table-wrap"><table className="data-table stored-eligibility-table"><thead><tr><th>Row</th><th>Name</th><th>Number</th><th>Consent</th><th>Suppression</th><th>Decision</th></tr></thead><tbody>{storedRows.map((row) => (
            <tr key={row.eligibilityRowId}><td>{row.sourceRowNumber}</td><td>{row.displayName ?? '—'}</td><td><code>{row.normalizedE164}</code></td><td>{consentStateLabel(row.consentState)}<small>{row.consentSource?.replaceAll('_', ' ') ?? '—'}</small></td><td>{row.suppressionState}<small>{row.suppressionReason?.replaceAll('_', ' ') ?? '—'}</small></td><td><span className={row.eligibilityState === 'eligible' ? 'badge badge-success' : 'badge badge-warning'}>{row.eligibilityState}</span><small>{blockReasonLabel(row.blockReason)}</small></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}

      <section className="notice warning-notice">Eligibility snapshots are a compliance gate. 0.12 can now draft and preview personalized text from a stored snapshot, but campaign confirmation, queueing and sending remain disabled.</section>
    </div>
  )
}
