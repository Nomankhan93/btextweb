import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { blockReasonLabel, consentStateLabel, summarizeEligibility } from '../lib/consentSuppression'
import {
  createRecipientEligibilitySnapshot,
  getRecipientEligibilitySnapshotRows,
  listRecipientEligibilityRows,
  listRecipientEligibilitySnapshots,
  recordRecipientPreviewBulkConsent,
  type RecipientEligibilityRow,
  type RecipientEligibilitySnapshotSummary,
  type StoredEligibilityRow,
} from '../lib/consentSuppressionApi'
import { errorMessage } from '../lib/errors'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function RecipientEligibilityPage() {
  const { previewId = '' } = useParams()
  const { workspace } = useWorkspace()
  const [rows, setRows] = useState<RecipientEligibilityRow[]>([])
  const [snapshots, setSnapshots] = useState<RecipientEligibilitySnapshotSummary[]>([])
  const [storedRows, setStoredRows] = useState<StoredEligibilityRow[]>([])
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [bulkConsentConfirmed, setBulkConsentConfirmed] = useState(false)
  const [bulkEvidenceReference, setBulkEvidenceReference] = useState('')
  const canCreate = true

  const summary = useMemo(() => summarizeEligibility(rows), [rows])

  const refresh = useCallback(async () => {
    if (!workspace || !previewId) return
    setLoading(true)
    setError(null)
    try {
      const [nextRows, nextSnapshots] = await Promise.all([
        listRecipientEligibilityRows(workspace.id, previewId),
        listRecipientEligibilitySnapshots(workspace.id, previewId),
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
  }, [workspace, previewId])

  useEffect(() => { void refresh() }, [refresh])

  async function saveSnapshot() {
    if (!workspace || !previewId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const snapshotId = await createRecipientEligibilitySnapshot(workspace.id, previewId)
      const [nextRows, nextSnapshots, nextStored] = await Promise.all([
        listRecipientEligibilityRows(workspace.id, previewId),
        listRecipientEligibilitySnapshots(workspace.id, previewId),
        getRecipientEligibilitySnapshotRows(workspace.id, snapshotId),
      ])
      setRows(nextRows)
      setSnapshots(nextSnapshots)
      setStoredRows(nextStored)
      setActiveSnapshotId(snapshotId)
      setMessage('Eligibility result saved. Nothing has been sent.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not create eligibility snapshot.'))
    } finally {
      setBusy(false)
    }
  }


  async function recordBulkConsent() {
    if (!workspace || !previewId || !bulkConsentConfirmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await recordRecipientPreviewBulkConsent({
        organizationId: workspace.id,
        previewId,
        source: 'import',
        evidenceNote: 'Bulk consent declaration from the recipient eligibility screen. The account owner confirmed that the included recipients may receive this campaign.',
        evidenceReference: bulkEvidenceReference.trim() || `Recipient preview ${previewId}`,
      })
      await refresh()
      setMessage(`${result.newGrantEvents.toLocaleString()} consent grant${result.newGrantEvents === 1 ? '' : 's'} recorded. Existing do-not-send blocks remain enforced.`)
      setBulkConsentConfirmed(false)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not record the bulk consent declaration.'))
    } finally {
      setBusy(false)
    }
  }

  async function viewSnapshot(snapshotId: string) {
    if (!workspace) return
    setBusy(true)
    setError(null)
    try {
      setStoredRows(await getRecipientEligibilitySnapshotRows(workspace.id, snapshotId))
      setActiveSnapshotId(snapshotId)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load eligibility snapshot rows.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null
  if (loading) return <LoadingState label="Evaluating consent and suppression…" />

  const sourceFilename = rows[0]?.sourceFilename ?? 'Recipient preview'

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">Eligibility</p>
          <h1>Check consent & do-not-send</h1>
          <p>Check each prepared recipient against current consent evidence and your do-not-send list before writing the campaign message.</p>
        </div>
        <Link className="secondary-button compact-button" to="/imports">Back to recipients</Link>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Recipient list</p><h2>{sourceFilename}</h2></div></div>
        <p className="muted-copy">A do-not-send block always overrides consent. Recipients without active consent cannot continue.</p>
      </section>

      <section className="metric-grid eligibility-metrics">
        <article className="metric-card"><span>Candidates</span><h2>{summary.total}</h2><p>Prepared recipients ready for eligibility checks.</p></article>
        <article className="metric-card"><span>Eligible</span><h2>{summary.eligible}</h2><p>Active consent and no do-not-send block.</p></article>
        <article className="metric-card"><span>Consent blocked</span><h2>{summary.noConsent + summary.revoked + summary.expired}</h2><p>{summary.noConsent} none · {summary.revoked} revoked · {summary.expired} expired</p></article>
        <article className="metric-card"><span>Do-not-send</span><h2>{summary.suppressed}</h2><p>Blocked numbers cannot continue even when consent exists.</p></article>
      </section>

      {summary.noConsent + summary.revoked + summary.expired > 0 ? (
        <section className="panel bulk-consent-panel">
          <div className="panel-heading"><div><p className="eyebrow">Bulk consent</p><h2>Confirm the prepared list once</h2><p className="muted-copy">Use this only when the recipients in this list have actually agreed to receive the campaign. You do not need to manage each number individually.</p></div></div>
          <label className="consent-check"><input type="checkbox" checked={bulkConsentConfirmed} disabled={busy} onChange={(event) => setBulkConsentConfirmed(event.target.checked)} /><span><strong>I confirm the included recipients have consented to receive this campaign.</strong><small>One append-only consent event is recorded per included recipient. Do-not-send status still overrides consent.</small></span></label>
          <label className="field"><span>Evidence / list reference (optional)</span><input value={bulkEvidenceReference} disabled={busy} maxLength={500} onChange={(event) => setBulkEvidenceReference(event.target.value)} placeholder="CRM export, signup batch, customer list…" /></label>
          <div className="button-row"><button className="primary-button" type="button" disabled={busy || !bulkConsentConfirmed} onClick={() => void recordBulkConsent()}>{busy ? 'Recording…' : `Record consent for prepared list`}</button></div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Current checks</p><h2>Recipient eligibility</h2></div>
          <div className="recipient-actions"><button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button>{canCreate ? <button className="primary-button compact-button" type="button" disabled={busy || rows.length === 0} onClick={() => void saveSnapshot()}>{busy ? 'Saving…' : 'Save eligibility result'}</button> : null}</div>
        </div>
        {rows.length === 0 ? <EmptyState title="No included recipients">The selected recipient preview contains no included candidates.</EmptyState> : (
          <div className="table-wrap"><table className="data-table eligibility-table"><thead><tr><th>Row</th><th>Name</th><th>Number</th><th>Consent</th><th>Do-not-send</th><th>Eligibility</th><th /></tr></thead><tbody>{rows.map((row) => (
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
        <div className="panel-heading"><div><p className="eyebrow">Saved checks</p><h2>Eligibility history</h2></div></div>
        {snapshots.length === 0 ? <EmptyState title="No saved eligibility checks">When consent and do-not-send records are ready, save the current eligibility result.</EmptyState> : (
          <div className="table-wrap"><table className="data-table eligibility-history-table"><thead><tr><th>Revision</th><th>Eligible</th><th>Blocked breakdown</th><th>Created</th><th /></tr></thead><tbody>{snapshots.map((snapshot) => (
            <tr key={snapshot.snapshotId}><td><strong>#{snapshot.revision}</strong></td><td><span className="badge badge-success">{snapshot.eligibleRows} eligible</span><small>{snapshot.candidateRows} candidates</small></td><td>{snapshot.noConsentRows} no consent · {snapshot.consentRevokedRows} revoked · {snapshot.consentExpiredRows} expired · {snapshot.suppressedRows} suppressed</td><td>{dateTime(snapshot.createdAt)}</td><td><button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void viewSnapshot(snapshot.snapshotId)}>{activeSnapshotId === snapshot.snapshotId ? 'Viewing' : 'View'}</button></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      {activeSnapshotId ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Saved eligibility</p><h2>Recipient decisions</h2></div><div className="recipient-actions"><span className="badge badge-success">{storedRows.filter((row) => row.eligibilityState === 'eligible').length} eligible</span>{storedRows.some((row) => row.eligibilityState === 'eligible') ? <Link className="primary-button compact-button" to={`/composer?snapshot=${encodeURIComponent(activeSnapshotId)}`}>Write message</Link> : <span className="badge badge-warning">Consent required</span>}</div></div>
          <div className="table-wrap"><table className="data-table stored-eligibility-table"><thead><tr><th>Row</th><th>Name</th><th>Number</th><th>Consent</th><th>Do-not-send</th><th>Decision</th></tr></thead><tbody>{storedRows.map((row) => (
            <tr key={row.eligibilityRowId}><td>{row.sourceRowNumber}</td><td>{row.displayName ?? '—'}</td><td><code>{row.normalizedE164}</code></td><td>{consentStateLabel(row.consentState)}<small>{row.consentSource?.replaceAll('_', ' ') ?? '—'}</small></td><td>{row.suppressionState}<small>{row.suppressionReason?.replaceAll('_', ' ') ?? '—'}</small></td><td><span className={row.eligibilityState === 'eligible' ? 'badge badge-success' : 'badge badge-warning'}>{row.eligibilityState}</span><small>{blockReasonLabel(row.blockReason)}</small></td></tr>
          ))}</tbody></table></div>
        </section>
      ) : null}

      <section className="notice warning-notice">Eligibility snapshots remain the compliance gate. With Android 0.17+, downloaded cloud jobs may be explicitly submitted on the exact bound SIM; SENT/DELIVERED cloud callbacks and scheduling are not yet part of this Web release.</section>
    </div>
  )
}
