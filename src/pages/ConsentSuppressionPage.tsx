import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import {
  blockReasonLabel,
  consentStateLabel,
  suppressionStateLabel,
  type ContactComplianceStatus,
} from '../lib/consentSuppression'
import {
  getContactComplianceStatus,
  listContactComplianceHistory,
  listContactComplianceStatuses,
  recordContactConsent,
  recordContactSuppression,
  type ContactComplianceHistoryEvent,
  type ConsentSource,
  type SuppressionReason,
  type SuppressionSource,
} from '../lib/consentSuppressionApi'
import { errorMessage } from '../lib/errors'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null
}

export function ConsentSuppressionPage() {
  const { workspace } = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [phone, setPhone] = useState(searchParams.get('phone') ?? '')
  const [status, setStatus] = useState<ContactComplianceStatus | null>(null)
  const [recent, setRecent] = useState<ContactComplianceStatus[]>([])
  const [history, setHistory] = useState<ContactComplianceHistoryEvent[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [consentSource, setConsentSource] = useState<ConsentSource>('manual')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const [suppressionReason, setSuppressionReason] = useState<SuppressionReason>('opt_out')
  const [suppressionSource, setSuppressionSource] = useState<SuppressionSource>('manual')
  const [suppressionNote, setSuppressionNote] = useState('')

  const canManage = true
  const canLift = true

  const refreshRecent = useCallback(async () => {
    if (!workspace) return
    setLoadingRecent(true)
    try {
      setRecent(await listContactComplianceStatuses(workspace.id, 100))
    } finally {
      setLoadingRecent(false)
    }
  }, [workspace])

  const loadStatus = useCallback(async (value: string) => {
    if (!workspace || !value.trim()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await getContactComplianceStatus(workspace.id, value.trim())
      setStatus(next)
      setPhone(next.normalizedE164)
      setSearchParams({ phone: next.normalizedE164 }, { replace: true })
      setHistory(canManage ? await listContactComplianceHistory(workspace.id, next.normalizedE164) : [])
    } catch (reason) {
      setStatus(null)
      setError(errorMessage(reason, 'Could not look up this number.'))
    } finally {
      setBusy(false)
    }
  }, [canManage, workspace, setSearchParams])

  useEffect(() => {
    setStatus(null)
    setHistory([])
    setError(null)
    setMessage(null)
    void refreshRecent().catch((reason) => setError(errorMessage(reason, 'Could not load consent/suppression records.')))
  }, [refreshRecent])

  useEffect(() => {
    const value = searchParams.get('phone')
    if (value && workspace) void loadStatus(value)
  }, [workspace]) // reload when the signed-in workspace changes

  const statusTone = useMemo(() => status?.eligibilityState === 'eligible' ? 'badge badge-success' : 'badge badge-warning', [status])

  async function recordConsent(eventType: 'granted' | 'revoked') {
    if (!workspace || !phone.trim()) return
    if (!evidenceNote.trim() && !evidenceReference.trim()) {
      setError('Add an evidence note or evidence reference before recording a consent event.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await recordContactConsent({
        organizationId: workspace.id,
        phone,
        eventType,
        source: consentSource,
        evidenceNote: evidenceNote.trim() || null,
        evidenceReference: evidenceReference.trim() || null,
        expiresAt: eventType === 'granted' ? toIso(expiresAt) : null,
      })
      const next = await getContactComplianceStatus(workspace.id, phone)
      setStatus(next)
      setPhone(next.normalizedE164)
      setHistory(await listContactComplianceHistory(workspace.id, next.normalizedE164))
      setMessage(eventType === 'granted' ? 'Consent grant recorded.' : 'Consent revocation recorded.')
      setEvidenceNote('')
      setEvidenceReference('')
      setExpiresAt('')
      await refreshRecent()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not record consent evidence.'))
    } finally {
      setBusy(false)
    }
  }

  async function updateSuppression(eventType: 'suppressed' | 'lifted') {
    if (!workspace || !phone.trim()) return
    if (eventType === 'lifted' && !suppressionNote.trim()) {
      setError('Add a note explaining why this suppression is being lifted.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await recordContactSuppression({
        organizationId: workspace.id,
        phone,
        eventType,
        reason: eventType === 'suppressed' ? suppressionReason : null,
        source: suppressionSource,
        note: suppressionNote.trim() || null,
      })
      const next = await getContactComplianceStatus(workspace.id, phone)
      setStatus(next)
      setPhone(next.normalizedE164)
      setHistory(await listContactComplianceHistory(workspace.id, next.normalizedE164))
      setMessage(eventType === 'suppressed' ? 'Number added to the do-not-send list.' : 'Number removed from the do-not-send list.')
      setSuppressionNote('')
      await refreshRecent()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not update suppression state.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">Recipient eligibility</p>
          <h1>Consent & do-not-send</h1>
          <p>Record consent evidence, maintain your do-not-send list and check whether a Pakistan mobile number can continue to campaign preparation.</p>
        </div>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Lookup</p><h2>Check a phone number</h2></div></div>
        <form className="compliance-lookup" onSubmit={(event) => { event.preventDefault(); void loadStatus(phone) }}>
          <label><span>Pakistan mobile number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="03001234567 or +923001234567" /></label>
          <button className="primary-button" type="submit" disabled={busy || !phone.trim()}>{busy ? 'Checking…' : 'Check status'}</button>
        </form>
      </section>

      {status ? (
        <>
          <section className="metric-grid compliance-metrics">
            <article className="metric-card"><span>Eligibility</span><h2>{status.eligibilityState === 'eligible' ? 'Eligible' : 'Blocked'}</h2><p>{blockReasonLabel(status.blockReason)}</p></article>
            <article className="metric-card"><span>Consent</span><h2>{consentStateLabel(status.consentState)}</h2><p>{status.consentSource ? `${status.consentSource.replaceAll('_', ' ')} · ${dateTime(status.consentOccurredAt)}` : 'No consent evidence is recorded.'}</p></article>
            <article className="metric-card"><span>Suppression</span><h2>{suppressionStateLabel(status.suppressionState)}</h2><p>{status.suppressionReason ? `${status.suppressionReason.replaceAll('_', ' ')} · ${dateTime(status.suppressionOccurredAt)}` : 'No active suppression event.'}</p></article>
          </section>

          <section className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Current number</p><h2><code>{status.normalizedE164}</code></h2></div><span className={statusTone}>{status.eligibilityState}</span></div>
            <dl className="definition-grid compliance-definition-grid">
              <div><dt>Consent source</dt><dd>{status.consentSource?.replaceAll('_', ' ') ?? '—'}</dd></div>
              <div><dt>Consent recorded</dt><dd>{dateTime(status.consentOccurredAt)}</dd></div>
              <div><dt>Consent expiry</dt><dd>{dateTime(status.consentExpiresAt)}</dd></div>
              <div><dt>Suppression source</dt><dd>{status.suppressionSource?.replaceAll('_', ' ') ?? '—'}</dd></div>
            </dl>
          </section>

          {canManage ? (
            <section className="compliance-editor-grid">
              <article className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Consent evidence</p><h2>Append a consent event</h2></div></div>
                <div className="stacked-form">
                  <label><span>Source</span><select value={consentSource} onChange={(event) => setConsentSource(event.target.value as ConsentSource)}><option value="manual">Manual record</option><option value="web_form">Web form</option><option value="paper_form">Paper form</option><option value="verbal">Verbal</option><option value="import">Import evidence</option><option value="api">API</option><option value="other">Other</option></select></label>
                  <label><span>Evidence note</span><textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Describe when/how consent was obtained or revoked." rows={3} /></label>
                  <label><span>Evidence reference</span><input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Form ID, CRM reference, ticket, file reference…" /></label>
                  <label><span>Grant expiry (optional)</span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
                  <div className="button-row compliance-buttons"><button className="primary-button" type="button" disabled={busy} onClick={() => void recordConsent('granted')}>Record grant</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void recordConsent('revoked')}>Record revocation</button></div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Do-not-send</p><h2>Block or release this number</h2></div></div>
                <div className="stacked-form">
                  <label><span>Reason</span><select value={suppressionReason} onChange={(event) => setSuppressionReason(event.target.value as SuppressionReason)}><option value="opt_out">Opt out</option><option value="complaint">Complaint</option><option value="manual">Manual block</option><option value="regulatory">Regulatory</option><option value="other">Other</option></select></label>
                  <label><span>Source</span><select value={suppressionSource} onChange={(event) => setSuppressionSource(event.target.value as SuppressionSource)}><option value="manual">Manual</option><option value="recipient_reply">Recipient reply</option><option value="import">Import</option><option value="api">API</option><option value="other">Other</option></select></label>
                  <label><span>Note</span><textarea value={suppressionNote} onChange={(event) => setSuppressionNote(event.target.value)} placeholder={status.suppressionState === 'suppressed' ? 'Add a note explaining why this suppression is being lifted.' : 'Optional context for the suppression.'} rows={3} /></label>
                  <div className="button-row compliance-buttons">
                    {status.suppressionState === 'suppressed'
                      ? <button className="secondary-button" type="button" disabled={busy || !canLift} onClick={() => void updateSuppression('lifted')}>Remove block</button>
                      : <button className="danger-button" type="button" disabled={busy} onClick={() => void updateSuppression('suppressed')}>Block number</button>}
                  </div>
                  {status.suppressionState === 'suppressed' && !canLift ? <p className="muted-copy">Suppression changes are available to the signed-in account owner.</p> : null}
                </div>
              </article>
            </section>
          ) : null}
        </>
      ) : null}

      {status && canManage ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Evidence history</p><h2>Append-only events for {status.normalizedE164}</h2></div><span className="badge badge-muted">{history.length} events</span></div>
          {history.length === 0 ? <EmptyState title="No evidence history">No consent or suppression event has been recorded for this number.</EmptyState> : (
            <div className="table-wrap"><table className="data-table compliance-history-table"><thead><tr><th>Kind</th><th>Event</th><th>Source</th><th>Evidence / note</th><th>Occurred</th></tr></thead><tbody>{history.map((event) => (
              <tr key={`${event.eventKind}-${event.eventId}`}><td>{event.eventKind}</td><td><strong>{event.eventType.replaceAll('_', ' ')}</strong><small>{event.reason?.replaceAll('_', ' ') ?? '—'}</small></td><td>{event.source.replaceAll('_', ' ')}</td><td>{event.detail ?? '—'}{event.evidenceReference ? <small>Ref: {event.evidenceReference}</small> : null}</td><td>{dateTime(event.occurredAt)}{event.expiresAt ? <small>Expires {dateTime(event.expiresAt)}</small> : null}</td></tr>
            ))}</tbody></table></div>
          )}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Recent records</p><h2>Consent & do-not-send records</h2></div><button className="secondary-button compact-button" type="button" disabled={loadingRecent || busy} onClick={() => void refreshRecent()}>Refresh</button></div>
        {loadingRecent ? <LoadingState label="Loading consent/suppression records…" /> : recent.length === 0 ? <EmptyState title="No compliance records">Look up a number and record consent evidence or a suppression event. No consent is assumed when no evidence exists.</EmptyState> : (
          <div className="table-wrap"><table className="data-table compliance-table"><thead><tr><th>Number</th><th>Consent</th><th>Suppression</th><th>Eligibility</th><th /></tr></thead><tbody>{recent.map((row) => (
            <tr key={row.normalizedE164}><td><code>{row.normalizedE164}</code></td><td><strong>{consentStateLabel(row.consentState)}</strong><small>{row.consentSource ? `${row.consentSource.replaceAll('_', ' ')} · ${dateTime(row.consentOccurredAt)}` : 'No evidence'}</small></td><td><strong>{suppressionStateLabel(row.suppressionState)}</strong><small>{row.suppressionReason?.replaceAll('_', ' ') ?? '—'}</small></td><td><span className={row.eligibilityState === 'eligible' ? 'badge badge-success' : 'badge badge-warning'}>{row.eligibilityState}</span><small>{blockReasonLabel(row.blockReason)}</small></td><td><button className="secondary-button compact-button" type="button" onClick={() => { setPhone(row.normalizedE164); void loadStatus(row.normalizedE164) }}>Open</button></td></tr>
          ))}</tbody></table></div>
        )}
      </section>

      <section className="notice warning-notice">A recipient must have valid consent and no active do-not-send block before continuing. This page does not send messages.</section>
    </div>
  )
}
