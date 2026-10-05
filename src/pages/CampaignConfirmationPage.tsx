import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { campaignConfirmationReadiness } from '../lib/campaignConfirmation'
import { confirmCampaign } from '../lib/campaignConfirmationApi'
import { errorMessage } from '../lib/errors'
import { listGatewayDevices, type GatewayDeviceSummary } from '../lib/gatewayDevices'
import { getMessagePersonalizationSourceRows, listMessageComposerDrafts, type MessageComposerDraft } from '../lib/messageComposerApi'
import { estimatePersonalizedSmsUsage } from '../lib/smsSegments'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function phoneLabel(device: GatewayDeviceSummary) {
  return [device.manufacturer, device.model].filter(Boolean).join(' ') || device.displayName
}

export function CampaignConfirmationPage() {
  const { workspace } = useWorkspace()
  const { draftId = '' } = useParams()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<MessageComposerDraft | null>(null)
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getMessagePersonalizationSourceRows>>>([])
  const [devices, setDevices] = useState<GatewayDeviceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace || !draftId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([listMessageComposerDrafts(workspace.id), listGatewayDevices(workspace.id)])
      .then(async ([drafts, nextDevices]) => {
        if (cancelled) return
        const nextDraft = drafts.find((item) => item.draftId === draftId) ?? null
        setDraft(nextDraft)
        setDevices(nextDevices)
        if (nextDraft) setRows(await getMessagePersonalizationSourceRows(workspace.id, nextDraft.eligibilitySnapshotId))
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not prepare campaign confirmation.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace, draftId])

  const activeDevice = useMemo(() => devices.find((device) => device.status === 'active') ?? null, [devices])
  const usage = useMemo(() => estimatePersonalizedSmsUsage(draft?.messageTemplate ?? '', rows), [draft, rows])
  const readiness = useMemo(() => campaignConfirmationReadiness({ draftId: draft?.draftId ?? null, smsUsage: usage, device: activeDevice }), [draft, usage, activeDevice])
  const previews = useMemo(() => usage.recipients.filter((item) => item.estimate).slice(0, 10), [usage])

  async function confirm() {
    if (!workspace || !draft || !activeDevice || !readiness.ready) return
    if (!window.confirm('Confirm this campaign? The recipients, personalized messages, estimated SMS units, phone and selected SIM will be frozen and cannot be edited.')) return
    setBusy(true)
    setError(null)
    try {
      const campaignId = await confirmCampaign(workspace.id, draft.draftId, activeDevice.deviceId)
      navigate(`/campaigns/${campaignId}`, { replace: true })
    } catch (reason) {
      setError(errorMessage(reason, 'Could not confirm the campaign.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null
  if (loading) return <LoadingState label="Preparing campaign review…" />
  if (!draft) return <EmptyState title="Draft not found">Choose a saved message draft before reviewing a campaign.</EmptyState>

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div>
          <p className="eyebrow">Campaign review</p>
          <h1>Review &amp; confirm</h1>
          <p>Check the exact recipients, personalized messages, estimated SMS usage, phone and SIM that will be frozen for this campaign.</p>
        </div>
        <Link className="secondary-button" to={`/composer?snapshot=${draft.eligibilitySnapshotId}&draft=${draft.draftId}`}>Edit draft</Link>
      </section>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {!readiness.ready ? <div className="notice warning-notice"><strong>Confirmation is blocked.</strong><ul className="confirmation-blockers">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}

      <section className="metric-grid confirmation-metrics">
        <article className="metric-card"><span>Recipients</span><h2>{usage.readyRecipients.toLocaleString()}</h2><p>Personalized messages ready to freeze.</p></article>
        <article className="metric-card"><span>Estimated SMS units</span><h2>{usage.estimatedSmsUnits.toLocaleString()}</h2><p>Carrier deduction may differ.</p></article>
        <article className="metric-card"><span>Encoding</span><h2>{usage.encodingSummary}</h2><p>{usage.gsm7Recipients} GSM-7 · {usage.unicodeRecipients} Unicode</p></article>
        <article className="metric-card"><span>Segments</span><h2>{usage.minimumSegments}–{usage.maximumSegments}</h2><p>{usage.averageSegments.toFixed(2)} average per recipient.</p></article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Message</p><h2>{draft.title}</h2></div><span className="badge badge-muted">Draft updated {dateTime(draft.updatedAt)}</span></div>
        <pre className="campaign-template-preview">{draft.messageTemplate}</pre>
        <p className="muted-copy">The server will render the template again from the stored eligible-recipient snapshot when you confirm. Confirmation fails if any personalization value is missing.</p>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Phone &amp; SIM</p><h2>Sending identity snapshot</h2></div></div>
        {activeDevice ? (
          <div className="definition-grid confirmation-device-grid">
            <div><dt>Phone</dt><dd>{phoneLabel(activeDevice)}</dd></div>
            <div><dt>Status</dt><dd>{activeDevice.status === 'active' ? 'Connected' : activeDevice.status}</dd></div>
            <div><dt>Selected SIM</dt><dd>{activeDevice.boundCarrierName || 'No SIM selected'}{activeDevice.boundSlotIndex == null ? '' : ` · SIM ${activeDevice.boundSlotIndex + 1}`}</dd></div>
            <div><dt>Last seen</dt><dd>{dateTime(activeDevice.lastSeenAt)}</dd></div>
          </div>
        ) : <EmptyState title="No Android phone paired">Pair your Android phone before confirming a campaign.</EmptyState>}
        <p className="muted-copy">Confirmation freezes this phone and SIM reference. A later SIM change will require fresh send authorization; BulkText never silently falls back to another SIM.</p>
        {!activeDevice || activeDevice.bindingStatus !== 'ready' ? <Link className="primary-link inline-action" to="/devices">Open Phone &amp; SIM</Link> : null}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Recipient snapshot</p><h2>Rendered examples</h2></div><span className="badge badge-success">{usage.readyRecipients} ready</span></div>
        <div className="message-preview-list">{previews.map((preview) => (
          <article className="message-preview-card" key={preview.row.eligibilityRowId}>
            <div className="message-preview-meta"><strong>{preview.row.displayName ?? preview.row.normalizedE164}</strong><code>{preview.row.normalizedE164}</code>{preview.estimate ? <span className="badge badge-muted">{preview.estimate.encoding} · {preview.estimate.segments} SMS</span> : null}</div>
            <p>{preview.text}</p>
          </article>
        ))}</div>
        {usage.readyRecipients > previews.length ? <p className="muted-copy">Showing {previews.length} examples. Confirmation freezes all {usage.readyRecipients} recipients server-side.</p> : null}
      </section>

      <section className="panel confirmation-action-panel">
        <div><p className="eyebrow">Immutable confirmation</p><h2>Freeze this campaign</h2><p className="muted-copy">After confirmation, edits to the source file, recipient preparation or message draft do not change this campaign snapshot. Confirmation itself sends nothing; the next screen performs the exact-SIM Web → Android handoff.</p></div>
        <button className="primary-button" type="button" disabled={!readiness.ready || busy} onClick={() => void confirm()}>{busy ? 'Confirming…' : 'Confirm & continue to send'}</button>
      </section>
    </div>
  )
}
