import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActionDialog } from '../components/ActionDialog'
import { EmptyState, LoadingState } from '../components/StateViews'
import { campaignConfirmationReadiness } from '../lib/campaignConfirmation'
import { confirmCampaign } from '../lib/campaignConfirmationApi'
import { errorMessage } from '../lib/errors'
import { listGatewayDevices, type GatewayDeviceSummary } from '../lib/gatewayDevices'
import { analyzeMessageTemplate } from '../lib/messageComposer'
import { getMessagePersonalizationSourceRows, listMessageComposerDrafts, type MessageComposerDraft } from '../lib/messageComposerApi'
import { maskRecipientNumber } from '../lib/recipientDisplay'
import { estimatePersonalizedSmsUsage } from '../lib/smsSegments'
import { useOperationGuard } from '../lib/useOperationGuard'
import { useAuth } from '../auth/AuthProvider'
import { campaignDraftKey, readCampaignDraft, removeCampaignDraft } from '../lib/campaignDraftStorage'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { usePwa } from '../pwa/PwaProvider'

function dateTime(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function phoneLabel(device: GatewayDeviceSummary) {
  return [device.manufacturer, device.model].filter(Boolean).join(' ') || device.displayName
}

function deviceOptionLabel(device: GatewayDeviceSummary) {
  const phone = phoneLabel(device)
  const carrier = device.boundCarrierName || 'SIM not ready'
  const slot = device.boundSlotIndex == null ? '' : ` · SIM ${device.boundSlotIndex + 1}`
  return `${phone} · ${carrier}${slot}`
}

export function CampaignConfirmationPage() {
  const { workspace } = useWorkspace()
  const { draftId = '' } = useParams()
  return workspace ? <CampaignReview key={`${workspace.id}:${draftId}`} /> : null
}

function CampaignReview() {
  const { workspace } = useWorkspace()
  const { draftId = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const operation = useOperationGuard()
  const { online } = usePwa()
  const [reload, setReload] = useState(0)
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [draft, setDraft] = useState<MessageComposerDraft | null>(null)
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getMessagePersonalizationSourceRows>>>([])
  const [devices, setDevices] = useState<GatewayDeviceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [showAllRecipients, setShowAllRecipients] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace || !draftId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setDraft(null)
    setRows([])
    setDevices([])
    setSelectedDeviceId('')
    void Promise.all([listMessageComposerDrafts(workspace.id), listGatewayDevices(workspace.id)])
      .then(async ([drafts, nextDevices]) => {
        if (cancelled) return
        const nextDraft = drafts.find((item) => item.draftId === draftId) ?? null
        const nextRows = nextDraft ? await getMessagePersonalizationSourceRows(workspace.id, nextDraft.eligibilitySnapshotId) : []
        if (cancelled) return
        setDraft(nextDraft)
        setRows(nextRows)
        setDevices(nextDevices)
        const active = nextDevices.filter((device) => device.status === 'active')
        if (active.length === 1) setSelectedDeviceId(active[0].deviceId)
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not prepare campaign confirmation.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace?.id, draftId, reload])

  const activeDevice = useMemo(() => devices.find((device) => device.deviceId === selectedDeviceId && device.status === 'active') ?? null, [devices, selectedDeviceId])
  const usage = useMemo(() => estimatePersonalizedSmsUsage(draft?.messageTemplate ?? '', rows), [draft, rows])
  const templateAnalysis = useMemo(() => analyzeMessageTemplate(draft?.messageTemplate ?? ''), [draft])
  const personalized = templateAnalysis.tokens.length > 0
  const readiness = useMemo(() => campaignConfirmationReadiness({ draftId: draft?.draftId ?? null, smsUsage: usage, device: activeDevice }), [draft, usage, activeDevice])
  const previewableRecipients = useMemo(() => usage.recipients.filter((item) => item.estimate), [usage])
  const featuredPreviews = useMemo(() => previewableRecipients.slice(0, 3), [previewableRecipients])
  const expandedPreviews = useMemo(() => previewableRecipients.slice(3, 100), [previewableRecipients])
  const segmentSummary = usage.readyRecipients === 0
    ? '—'
    : usage.minimumSegments === usage.maximumSegments
      ? `${usage.maximumSegments} segment${usage.maximumSegments === 1 ? '' : 's'} each`
      : `${usage.minimumSegments}–${usage.maximumSegments} segments per recipient`

  async function confirm() {
    if (!workspace || !draft || !activeDevice || !readiness.ready || !online || busy) return
    if (!operation.start()) return
    setBusy(true)
    setError(null)
    try {
      const campaignId = await confirmCampaign(workspace.id, draft.draftId, activeDevice.deviceId)
      operation.check()
      if (user) {
        const key = campaignDraftKey(user.id, workspace.id)
        if (readCampaignDraft(key)?.draftId === draft.draftId) removeCampaignDraft(key)
      }
      navigate(`/campaigns/${campaignId}`, { replace: true })
    } catch (reason) {
      if (!operation.active.current) return
      setConfirmDialogOpen(false)
      setError(errorMessage(reason, 'Could not confirm the campaign.'))
    } finally {
      operation.finish()
      if (operation.active.current) setBusy(false)
    }
  }

  if (!workspace) return null
  if (loading) return <div className="page-stack campaign-review-page"><div className="campaign-wizard-mobile-header" aria-label="Campaign review navigation"><Link className="campaign-wizard-back" to="/campaigns/new">← Message</Link><strong>Review campaign</strong><Link className="campaign-wizard-exit" to="/campaigns">Exit</Link></div><LoadingState label="Preparing campaign review…" /></div>
  if (!draft) return <div className="page-stack campaign-review-page"><div className="campaign-wizard-mobile-header" aria-label="Campaign review navigation"><Link className="campaign-wizard-back" to="/campaigns/new">← Message</Link><strong>Review campaign</strong><Link className="campaign-wizard-exit" to="/campaigns">Exit</Link></div>{error ? <div role="alert" className="notice error-notice">{error}</div> : <EmptyState title="Draft not found">Choose a saved message draft before reviewing a campaign.</EmptyState>}<div className="button-row"><button type="button" className="secondary-button" disabled={!online} onClick={() => setReload((value) => value + 1)}>Retry review</button><Link to="/composer">Open saved drafts</Link></div></div>

  const localKey = user ? campaignDraftKey(user.id, workspace.id) : null
  const editUrl = localKey && readCampaignDraft(localKey)?.draftId === draft.draftId
    ? '/campaigns/new' : `/composer?snapshot=${draft.eligibilitySnapshotId}&draft=${draft.draftId}`

  return (
    <div className="page-stack campaign-review-page">
      <div className="campaign-wizard-mobile-header" aria-label="Campaign review navigation">
        <Link className="campaign-wizard-back" to={editUrl}>← Message</Link>
        <strong>Review campaign</strong>
        <Link className="campaign-wizard-exit" to="/campaigns">Exit</Link>
      </div>
      <section className="page-heading recipient-heading campaign-wizard-heading">
        <div>
          <p className="eyebrow">Campaign review</p>
          <h1>Review &amp; confirm</h1>
          <p>Verify who will receive this message, what they will receive, and which phone and SIM will send it.</p>
        </div>
        <Link className="secondary-button" to={editUrl}>Edit campaign</Link>
      </section>

      <ol className="simple-stepper campaign-wizard-stepper campaign-review-stepper" aria-label="Campaign progress">
        <li className="completed"><span>✓</span><strong>Campaign</strong></li>
        <li className="completed"><span>✓</span><strong>Recipients</strong></li>
        <li className="completed"><span>✓</span><strong>Message</strong></li>
        <li className="active" aria-current="step"><span>4</span><strong>Review</strong></li>
      </ol>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {!online ? <div className="notice warning-notice"><strong>Reconnect to confirm.</strong> Campaign review can stay open offline, but confirmation requires fresh server and Phone &amp; SIM checks.</div> : null}
      {!readiness.ready ? <div className="notice warning-notice"><strong>Confirmation is blocked.</strong><ul className="confirmation-blockers">{readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}

      <section className="review-summary-strip" aria-label="Campaign summary">
        <strong>{usage.readyRecipients.toLocaleString()} recipients</strong><span>·</span><strong>~{usage.estimatedSmsUnits.toLocaleString()} SMS</strong><span>·</span><span>{usage.encodingSummary}</span><span>·</span><span>{segmentSummary}</span>
      </section>

      <section className="panel review-message-panel">
        <div className="panel-heading"><div><p className="eyebrow">Message</p><h2>{draft.title}</h2><p className="muted-copy">Updated {dateTime(draft.updatedAt)}</p></div><Link className="text-button" to={editUrl}>Edit message</Link></div>
        <pre className="campaign-template-preview">{draft.messageTemplate}</pre>
      </section>

      <section className="panel review-sending-panel">
        <div className="panel-heading"><div><p className="eyebrow">Sending from</p><h2>Phone &amp; SIM</h2></div>{activeDevice?.bindingStatus === 'ready' ? <span className="badge badge-success">SIM selected</span> : null}</div>
        <label className="field review-device-select"><span>Sending phone</span><select disabled={busy} value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)}><option value="">Select a paired phone…</option>{devices.filter((device) => device.status === 'active').map((device) => <option key={device.deviceId} value={device.deviceId}>{deviceOptionLabel(device)}</option>)}</select></label>
        {activeDevice ? <div className="review-sending-card">
          <div><strong>{phoneLabel(activeDevice)}</strong><span>{activeDevice.boundCarrierName || 'No SIM selected'}{activeDevice.boundSlotIndex == null ? '' : ` · SIM ${activeDevice.boundSlotIndex + 1}`}</span></div>
          <small>{activeDevice.lastSeenAt ? `Last seen ${dateTime(activeDevice.lastSeenAt)}` : 'No recent check-in recorded'}</small>
        </div> : <EmptyState title="Select a sending phone">Select an active paired phone above, or open Phone &amp; SIM to pair one.</EmptyState>}
        {!activeDevice || activeDevice.bindingStatus !== 'ready' ? <Link className="primary-link inline-action" to="/devices">Open Phone &amp; SIM</Link> : null}
      </section>

      <section className="panel review-recipient-panel">
        <div className="panel-heading"><div><p className="eyebrow">Recipients</p><h2>Recipient preview</h2></div><span className="badge badge-success">{usage.readyRecipients.toLocaleString()} ready</span></div>
        {!personalized ? <p className="muted-copy review-shared-message-note">Everyone receives the message shown above. Recipient numbers are masked on this review screen.</p> : <p className="muted-copy review-shared-message-note">Personalized examples are shown below. Recipient numbers are masked on this review screen.</p>}
        <div className="review-recipient-list">{featuredPreviews.map((preview) => (
          <article className="review-recipient-row" key={preview.row.eligibilityRowId}>
            <div className="review-recipient-identity"><strong>{preview.row.displayName || 'Recipient'}</strong><code>{maskRecipientNumber(preview.row.normalizedE164)}</code></div>
            {personalized ? <p>{preview.text}</p> : null}
            {preview.estimate ? <span className="review-recipient-sms">{preview.estimate.encoding} · {preview.estimate.segments} SMS</span> : null}
          </article>
        ))}</div>
        {previewableRecipients.length > featuredPreviews.length ? <div className="review-all-recipients">
          <button className="text-button review-all-recipients-toggle" type="button" aria-expanded={showAllRecipients} onClick={() => setShowAllRecipients((value) => !value)}>{showAllRecipients ? 'Show fewer recipients' : `Preview first ${Math.min(100, previewableRecipients.length).toLocaleString()} recipients`}</button>
          {showAllRecipients ? <><div className="review-recipient-list review-recipient-list-expanded">{expandedPreviews.map((preview) => (
            <article className="review-recipient-row" key={preview.row.eligibilityRowId}>
              <div className="review-recipient-identity"><strong>{preview.row.displayName || 'Recipient'}</strong><code>{maskRecipientNumber(preview.row.normalizedE164)}</code></div>
              {personalized ? <p>{preview.text}</p> : null}
            </article>
          ))}</div>{previewableRecipients.length > expandedPreviews.length + featuredPreviews.length ? <p className="muted-copy">Showing the first {(expandedPreviews.length + featuredPreviews.length).toLocaleString()} recipients here. All {previewableRecipients.length.toLocaleString()} remain included in the confirmation.</p> : null}</> : null}
        </div> : null}
      </section>

      <section className="panel confirmation-action-panel">
        <div><p className="eyebrow">Ready to confirm</p><h2>Confirm this campaign</h2><p className="muted-copy">Confirming locks the recipients, message, phone and selected SIM for this campaign. Nothing is sent yet.</p></div>
        <button className="primary-button" type="button" disabled={!online || !readiness.ready || busy} onClick={() => setConfirmDialogOpen(true)}>{busy ? 'Confirming…' : 'Confirm campaign'}</button>
      </section>

      <ActionDialog
        open={confirmDialogOpen}
        eyebrow="Campaign confirmation"
        title="Confirm campaign?"
        description="After confirmation, these campaign details cannot be edited. Nothing will be sent yet."
        confirmLabel="Confirm campaign"
        busyLabel="Confirming…"
        cancelLabel="Go back"
        busy={busy}
        onCancel={() => setConfirmDialogOpen(false)}
        onConfirm={confirm}
      >
        <div className="action-dialog-summary">
          <div><span>Campaign</span><strong>{draft.title}</strong></div>
          <div><span>Recipients</span><strong>{usage.readyRecipients.toLocaleString()}</strong></div>
          <div><span>Estimated SMS</span><strong>{usage.estimatedSmsUnits.toLocaleString()}</strong></div>
          <div><span>Sending from</span><strong>{activeDevice ? deviceOptionLabel(activeDevice) : 'Select a phone & SIM'}</strong></div>
        </div>
      </ActionDialog>
    </div>
  )
}
