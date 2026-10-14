import { ActionDialog } from '../components/ActionDialog'
import { SyncFreshness } from '../components/SyncFreshness'
import { useCampaignLiveStatus } from '../lib/useCampaignLiveStatus'
import { contractNotices } from '../lib/deliveryContract'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { deleteCampaign, getCampaignConfirmation, listCampaignConfirmationRecipients, type CampaignConfirmationDetail, type CampaignConfirmationRecipient } from '../lib/campaignConfirmationApi'
import { canCreateDurableQueue, dispatchProgress, dispatchSummary } from '../lib/durableQueue'
import { enqueueCampaignDispatch } from '../lib/durableQueueApi'
import { attemptBadgeClass, deliveryAttentionJobs, deliveryProgress, deliverySummary, processedDeliveryJobs, processingProgress, resolvedUnknownJobs, sentProgress, type CampaignDeliveryStatus, type MessageRecoveryAction } from '../lib/deliveryAttempts'
import { requestCampaignMessageRecovery } from '../lib/deliveryAttemptsApi'
import { errorMessage } from '../lib/errors'
import { authorizationIsActive, canAuthorizeCampaign, preflightSummary, type CampaignSendAuthorization, type CampaignSendPreflight } from '../lib/gatewayPreflight'
import { authorizeCampaignSend, getCampaignSendPreflight, getLatestCampaignSendAuthorization, revokeCampaignSendAuthorization } from '../lib/gatewayPreflightApi'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { usePwa } from '../pwa/PwaProvider'
import { maskRecipientNumber } from '../lib/recipientDisplay'



type LiveDeliveryTone = 'active' | 'success' | 'warning' | 'neutral'

function liveDeliveryPresentation(status: CampaignDeliveryStatus | null, dispatch: { recipientCount: number; queuedJobs: number; leasedJobs: number; downloadedJobs: number }) {
  const total = Math.max(0, dispatch.recipientCount)
  if (!status) {
    if (dispatch.downloadedJobs > 0) return { title: 'Starting on phone', badge: 'Starting', tone: 'active' as LiveDeliveryTone, summary: `${dispatch.downloadedJobs.toLocaleString()} of ${total.toLocaleString()} jobs have reached Android. Waiting for send status.` }
    if (dispatch.leasedJobs > 0) return { title: 'Phone receiving jobs', badge: 'Connecting', tone: 'active' as LiveDeliveryTone, summary: `${dispatch.leasedJobs.toLocaleString()} job${dispatch.leasedJobs === 1 ? '' : 's'} are being handed to the paired Android phone.` }
    return { title: 'Waiting for phone', badge: 'Queued', tone: 'neutral' as LiveDeliveryTone, summary: `${dispatch.queuedJobs.toLocaleString()} job${dispatch.queuedJobs === 1 ? '' : 's'} are waiting for the paired Android phone.` }
  }

  const processed = processedDeliveryJobs(status)
  const knownSent = status.sentJobs + status.deliveredJobs
  const resolvedUnknown = resolvedUnknownJobs(status)
  if (status.unresolvedUnknownJobs > 0) return { title: 'Needs attention', badge: 'Attention', tone: 'warning' as LiveDeliveryTone, summary: `${status.unresolvedUnknownJobs.toLocaleString()} recipient result${status.unresolvedUnknownJobs === 1 ? '' : 's'} are UNKNOWN. BulkText will not automatically resend them.` }
  if (status.awaitingAttemptJobs > 0 && status.preparedJobs + status.submittedJobs === 0 && dispatch.downloadedJobs < total) return { title: dispatch.leasedJobs > 0 ? 'Phone receiving jobs' : 'Waiting for phone', badge: 'Queued', tone: 'neutral' as LiveDeliveryTone, summary: `${status.awaitingAttemptJobs.toLocaleString()} recipients are awaiting a phone attempt. Queued work is not sent SMS.` }
  if (status.awaitingAttemptJobs + status.preparedJobs + status.submittedJobs > 0) return { title: 'Sending in progress', badge: 'Live', tone: 'active' as LiveDeliveryTone, summary: `${processed.toLocaleString()} of ${status.recipientCount.toLocaleString()} recipients have a settled send outcome. Status refreshes automatically while work is active.` }
  if (status.failedJobs > 0) return { title: 'Completed with issues', badge: 'Review', tone: 'warning' as LiveDeliveryTone, summary: `${processed.toLocaleString()} of ${status.recipientCount.toLocaleString()} recipients are processed; ${status.failedJobs.toLocaleString()} failed result${status.failedJobs === 1 ? '' : 's'} need review.` }
  if (resolvedUnknown > 0) return { title: 'Completed with unverified results', badge: 'Review', tone: 'warning' as LiveDeliveryTone, summary: `${resolvedUnknown.toLocaleString()} UNKNOWN result${resolvedUnknown === 1 ? '' : 's'} were resolved without resend, so no SENT or DELIVERED claim is made for those recipients.` }
  if (status.deliveredJobs === status.recipientCount && status.recipientCount > 0) return { title: 'Delivery confirmed', badge: 'Delivered', tone: 'success' as LiveDeliveryTone, summary: `All ${status.recipientCount.toLocaleString()} recipients reported DELIVERED.` }
  if (knownSent === status.recipientCount && status.recipientCount > 0) return { title: 'Sending complete', badge: 'Sent', tone: 'success' as LiveDeliveryTone, summary: `All ${status.recipientCount.toLocaleString()} recipients have complete SENT success. Delivery receipts may continue to arrive.` }
  return { title: 'Tracking delivery', badge: 'Tracking', tone: 'active' as LiveDeliveryTone, summary: deliverySummary(status) }
}

function liveBadgeClass(tone: LiveDeliveryTone) {
  if (tone === 'success') return 'badge-success'
  if (tone === 'warning') return 'badge-warning'
  if (tone === 'active') return 'badge-live'
  return 'badge-muted'
}

function dateTime(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function CampaignDetailPage() {
  const { workspace } = useWorkspace()
  const { campaignId = '' } = useParams()
  if (!workspace || !campaignId) return null
  return <CampaignDetail key={`${workspace.id}:${campaignId}`} workspaceId={workspace.id} campaignId={campaignId} />
}

function CampaignDetail({ workspaceId, campaignId }: { workspaceId: string; campaignId: string }) {
  const workspace = { id: workspaceId }
  const navigate = useNavigate()
  const { online } = usePwa()
  const [campaign, setCampaign] = useState<CampaignConfirmationDetail | null>(null)
  const [recipients, setRecipients] = useState<CampaignConfirmationRecipient[]>([])
  const [preflight, setPreflight] = useState<CampaignSendPreflight | null>(null)
  const [authorization, setAuthorization] = useState<CampaignSendAuthorization | null>(null)
  const [loading, setLoading] = useState(true)
  const [safetyBusy, setSafetyBusy] = useState(false)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safetyError, setSafetyError] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const sendInFlight = useRef(false)
  const { dispatch, setDispatch, deliveryStatus, contractHealth, attempts, syncError, lastSuccessAt, nextRetryAt, fetching, loaded, refresh: refreshDelivery } = useCampaignLiveStatus(workspaceId, campaignId, loading || Boolean(error) || safetyBusy || recoveryBusy || deleteBusy)


  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!workspace || !campaignId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void Promise.all([
      getCampaignConfirmation(workspace.id, campaignId),
      listCampaignConfirmationRecipients(workspace.id, campaignId, 100, 0),
      getCampaignSendPreflight(workspace.id, campaignId),
      getLatestCampaignSendAuthorization(workspace.id, campaignId),
    ])
      .then(([nextCampaign, nextRecipients, nextPreflight, nextAuthorization]) => {
        if (cancelled) return
        setCampaign(nextCampaign)
        setRecipients(nextRecipients)
        setPreflight(nextPreflight)
        setAuthorization(nextAuthorization)
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not load the confirmed campaign.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspaceId, campaignId])

  async function requestRecovery(action: MessageRecoveryAction) {
    if (!online || !workspace || !campaignId || !dispatch || recoveryBusy) return
    setRecoveryBusy(true)
    setDeliveryError(null)
    try {
      const count = await requestCampaignMessageRecovery(workspace.id, campaignId, action)
      if (count === 0) {
        setDeliveryError('No new unresolved UNKNOWN attempts were found; existing pending requests are retained.')
      }
      await refreshDelivery()
      setRecoveryDialogOpen(false)
    } catch (reason) {
      setDeliveryError(errorMessage(reason, 'Could not request message recovery.'))
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function removeCampaign() {
    if (!online || !workspace || !campaignId || !campaign || deleteBusy) return
    if (!window.confirm(`Delete “${campaign.title}” from campaign history?\n\nBulkText will refuse deletion while Android has in-flight/downloaded work, unresolved UNKNOWN, pending recovery, or callbacks that are not safely terminal.`)) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteCampaign(workspace.id, campaignId)
      navigate('/campaigns', { replace: true })
    } catch (reason) {
      setDeleteError(errorMessage(reason, 'Could not delete this campaign.'))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function refreshSafety() {
    if (!online || !workspace || !campaignId) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const [nextPreflight, nextAuthorization] = await Promise.all([
        getCampaignSendPreflight(workspace.id, campaignId),
        getLatestCampaignSendAuthorization(workspace.id, campaignId),
        ])
      setPreflight(nextPreflight)
      setAuthorization(nextAuthorization)
      setNow(new Date())
    } catch (reason) {
      setSafetyError(errorMessage(reason, 'Could not refresh gateway preflight.'))
    } finally {
      setSafetyBusy(false)
    }
  }

  async function authorize() {
    if (!online || !workspace || !campaignId || dispatch || !canAuthorizeCampaign(preflight, authorization, now)) return
    if (!window.confirm('Authorize this confirmed campaign for 5 minutes? This phase does not queue or send any SMS.')) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const nextAuthorization = await authorizeCampaignSend(workspace.id, campaignId)
      setAuthorization(nextAuthorization)
      setNow(new Date())
    } catch (reason) {
      const message = errorMessage(reason, 'Could not authorize this campaign.')
      await refreshSafety()
      setSafetyError(message)
    } finally {
      setSafetyBusy(false)
    }
  }

  async function revoke() {
    if (!online || !workspace || !campaignId || !authorization || !authorizationIsActive(authorization, now)) return
    if (!window.confirm('Revoke this send authorization? No SMS has been queued or sent by this phase.')) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      await revokeCampaignSendAuthorization(workspace.id, campaignId, authorization.authorizationId)
      const nextAuthorization = await getLatestCampaignSendAuthorization(workspace.id, campaignId)
      setAuthorization(nextAuthorization)
      setNow(new Date())
    } catch (reason) {
      setSafetyError(errorMessage(reason, 'Could not revoke send authorization.'))
    } finally {
      setSafetyBusy(false)
    }
  }


  async function sendToPhone() {
    if (!online || !workspace || !campaignId || dispatch || safetyBusy || sendInFlight.current) return
    sendInFlight.current = true
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const freshPreflight = await getCampaignSendPreflight(workspace.id, campaignId)
      setPreflight(freshPreflight)
      if (!freshPreflight.ready) {
        setSendDialogOpen(false)
        setSafetyError(freshPreflight.blockers.join(' ' ) || 'The final phone & SIM check is blocked.')
        return
      }
      const freshAuthorization = await authorizeCampaignSend(workspace.id, campaignId)
      setAuthorization(freshAuthorization)
      const nextDispatch = await enqueueCampaignDispatch(workspace.id, campaignId, freshAuthorization.authorizationId)
      setDispatch(nextDispatch)
      setAuthorization(await getLatestCampaignSendAuthorization(workspace.id, campaignId))
      setNow(new Date())
      setSendDialogOpen(false)
    } catch (reason) {
      const message = errorMessage(reason, 'Could not start sending this campaign.')
      setSendDialogOpen(false)
      try { await refreshSafety() } catch {}
      setSafetyError(message)
    } finally {
      sendInFlight.current = false
      setSafetyBusy(false)
    }
  }

  const activeAuthorization = useMemo(() => authorizationIsActive(authorization, now), [authorization, now])
  const authorizationStatus = authorization ? (authorization.status === 'consumed' ? 'Consumed' : activeAuthorization ? 'Authorized' : authorization.revokedAt || authorization.status === 'revoked' ? 'Revoked' : 'Expired') : 'Not authorized'

  if (!workspace) return null
  if (loading) return <LoadingState label="Loading confirmed campaign…" />
  if (error) return <div className="notice error-notice">{error}</div>
  if (!campaign) return <EmptyState title="Campaign not found">The confirmed campaign could not be loaded.</EmptyState>

  const encoding = campaign.gsm7Recipients === campaign.recipientCount ? 'GSM-7' : campaign.unicodeRecipients === campaign.recipientCount ? 'Unicode' : 'Mixed'
  const phone = [campaign.gatewayManufacturer, campaign.gatewayModel].filter(Boolean).join(' ') || campaign.gatewayDeviceName
  const liveDelivery = dispatch ? liveDeliveryPresentation(deliveryStatus, dispatch) : null
  const processedJobs = processedDeliveryJobs(deliveryStatus)
  const attentionJobs = deliveryAttentionJobs(deliveryStatus)
  const knownSentJobs = deliveryStatus ? deliveryStatus.sentJobs + deliveryStatus.deliveredJobs : 0

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading confirmed-campaign-heading"><div><p className="eyebrow">Confirmed campaign</p><h1>{campaign.title}</h1><p>Confirmed {dateTime(campaign.confirmedAt)}. Recipients, message and selected SIM are locked for this campaign. Sending requires explicit confirmation and final safety checks.</p></div><div className="button-row"><Link className="secondary-button" to="/campaigns">Back to campaigns</Link><button className="danger-button" type="button" disabled={deleteBusy || !online} onClick={() => void removeCampaign()}>{deleteBusy ? 'Deleting…' : 'Delete campaign'}</button></div></section>
      {!online ? <div className="notice warning-notice"><strong>Offline safety mode.</strong> Last loaded campaign information may remain visible, but live status, authorization, queueing, recovery and sending are disabled until you reconnect.</div> : null}
      <div role="status" className="notice"><span>{syncError || (loaded ? 'Queue and delivery status refresh automatically.' : 'Loading queue and delivery status…')}</span> <button className="secondary-button" type="button" disabled={!online || fetching || safetyBusy || recoveryBusy || deleteBusy} onClick={refreshDelivery}>{fetching ? 'Refreshing…' : 'Refresh campaign status'}</button></div>
      <SyncFreshness lastSuccessAt={lastSuccessAt} nextRetryAt={nextRetryAt} />
      {deleteError ? <div className="notice error-notice">{deleteError}</div> : null}

      <section className={`panel simple-send-panel confirmed-send-panel ${dispatch ? 'live-delivery-panel' : ''}`}>
        <div className="panel-heading"><div><p className="eyebrow">{dispatch ? 'Live campaign status' : 'Send campaign'}</p><h2>{dispatch ? liveDelivery?.title : preflight?.ready ? 'Final check before sending' : 'Phone or recipients need attention'}</h2></div><span className={`badge ${dispatch && liveDelivery ? liveBadgeClass(liveDelivery.tone) : preflight?.ready ? 'badge-success' : 'badge-muted'}`}>{dispatch && liveDelivery ? liveDelivery.badge : preflight?.ready ? 'Ready' : 'Final check'}</span></div>
        {safetyError ? <div className="notice error-notice">{safetyError}</div> : null}
        {deliveryError ? <div className="notice error-notice">{deliveryError}</div> : null}
        {dispatch ? <>
          <p className="live-delivery-summary" aria-live="polite">{liveDelivery?.summary}</p>
          <div className="live-processing-progress">
            <div><strong>{processedJobs.toLocaleString()} of {dispatch.recipientCount.toLocaleString()} processed</strong><span>{processingProgress(deliveryStatus).toFixed(0)}%</span></div>
            <progress max={Math.max(1, dispatch.recipientCount)} value={processedJobs}>Send processing progress</progress>
          </div>
          <div className="live-stage-grid" aria-label="Live campaign progress">
            <div><div><span>Android received</span><strong>{dispatch.downloadedJobs.toLocaleString()} / {dispatch.recipientCount.toLocaleString()}</strong></div><progress max={Math.max(1, dispatch.recipientCount)} value={dispatch.downloadedJobs}>Android receipt progress</progress></div>
            <div><div><span>Known sent</span><strong>{deliveryStatus ? `${knownSentJobs.toLocaleString()} / ${deliveryStatus.recipientCount.toLocaleString()}` : 'Waiting'}</strong></div><progress max={Math.max(1, dispatch.recipientCount)} value={knownSentJobs}>Known sent progress</progress></div>
            <div><div><span>Delivered</span><strong>{deliveryStatus ? `${deliveryStatus.deliveredJobs.toLocaleString()} / ${deliveryStatus.recipientCount.toLocaleString()}` : 'Waiting'}</strong></div><progress max={Math.max(1, dispatch.recipientCount)} value={deliveryStatus?.deliveredJobs ?? 0}>Delivery receipt progress</progress></div>
          </div>
          <div className="live-delivery-facts">
            <div><span>Awaiting / active</span><strong>{deliveryStatus ? (deliveryStatus.awaitingAttemptJobs + deliveryStatus.preparedJobs + deliveryStatus.submittedJobs).toLocaleString() : '—'}</strong></div>
            <div><span>Known sent</span><strong>{deliveryStatus ? knownSentJobs.toLocaleString() : '—'}</strong></div>
            <div><span>Delivered</span><strong>{deliveryStatus ? deliveryStatus.deliveredJobs.toLocaleString() : '—'}</strong></div>
            <div className={attentionJobs ? 'has-attention' : ''}><span>Needs attention</span><strong>{deliveryStatus ? attentionJobs.toLocaleString() : '—'}</strong></div>
          </div>
          {deliveryStatus?.recoveryRequestedJobs ? <div className="notice warning-notice"><strong>Recovery requested.</strong> {deliveryStatus.recoveryRequestedJobs.toLocaleString()} UNKNOWN result{deliveryStatus.recoveryRequestedJobs === 1 ? '' : 's'} are waiting to be resolved without resend.</div> : null}
          {deliveryStatus?.unresolvedUnknownJobs && deliveryStatus.recoveryRequestedJobs === 0 ? <div className="live-recovery-action"><p>BulkText pauses automatic continuation for UNKNOWN outcomes because resending could duplicate a message that may already have left the phone.</p><button className="secondary-button" type="button" disabled={!online || recoveryBusy} onClick={() => setRecoveryDialogOpen(true)}>Continue without resending {deliveryStatus.unresolvedUnknownJobs.toLocaleString()} UNKNOWN</button></div> : null}
          <p className="technical-details-hint">Live status refreshes automatically. Detailed queue, callback and attempt diagnostics remain available below.</p>
        </> : <>
          <div className="send-readiness-summary">
            <div><span>Recipients</span><strong>{campaign.recipientCount.toLocaleString()}</strong></div>
            <div><span>Estimated SMS</span><strong>{campaign.estimatedSmsUnits.toLocaleString()}</strong></div>
            <div><span>Sending from</span><strong>{phone} · {campaign.simCarrierName || campaign.simDisplayName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</strong></div>
          </div>
          <p className="muted-copy">BulkText runs one final recipient, phone freshness and exact-SIM check before queueing. If a check fails, nothing is queued.</p>
          <div className="button-row"><button className="primary-button" type="button" disabled={!online || safetyBusy || !loaded} onClick={() => setSendDialogOpen(true)}>{safetyBusy ? 'Starting…' : `Start sending to ${campaign.recipientCount.toLocaleString()} recipients`}</button></div>
          <p className="technical-details-hint">Preflight, authorization and queue diagnostics remain available under Technical send details.</p>
        </>}
      </section>

      <section className="metric-grid confirmation-metrics">
        <article className="metric-card"><span>Recipients</span><h2>{campaign.recipientCount.toLocaleString()}</h2><p>Frozen recipient snapshot.</p></article>
        <article className="metric-card"><span>Estimated SMS</span><h2>{campaign.estimatedSmsUnits.toLocaleString()}</h2><p>Estimate only.</p></article>
        <article className="metric-card"><span>Encoding</span><h2>{encoding}</h2><p>{campaign.gsm7Recipients} GSM-7 · {campaign.unicodeRecipients} Unicode</p></article>
        <article className="metric-card"><span>Segments</span><h2>{campaign.minimumSegments === campaign.maximumSegments ? `${campaign.maximumSegments} each` : `${campaign.minimumSegments}–${campaign.maximumSegments} each`}</h2><p>{campaign.averageSegments.toFixed(2)} average.</p></article>
      </section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Frozen message</p><h2>Template snapshot</h2></div><span className="badge badge-success">Confirmed</span></div><pre className="campaign-template-preview">{campaign.messageTemplateSnapshot}</pre></section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Phone &amp; SIM</p><h2>Confirmed sending setup</h2></div></div><div className="definition-grid confirmed-device-summary"><div><dt>Phone</dt><dd>{phone}</dd></div><div><dt>Selected SIM</dt><dd>{campaign.simCarrierName || campaign.simDisplayName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</dd></div><div><dt>Connected when confirmed</dt><dd>{dateTime(campaign.gatewayLastSeenAt)}</dd></div></div></section>


      <details className="panel technical-send-disclosure">
        <summary>Technical send details</summary>
        <p className="muted-copy technical-disclosure-copy">Use these controls for diagnostics or recovery. The Start sending action above remains the normal workflow.</p>
        <div className="technical-send-panels">
      <section className="panel gateway-preflight-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Gateway preflight</p><h2>{dispatch ? 'Queue-time safety snapshot' : 'Current send-safety checks'}</h2></div>
          <span className={`badge ${dispatch || preflight?.ready ? 'badge-success' : 'badge-warning'}`}>{dispatch ? 'Queue created' : preflight?.ready ? 'Ready' : 'Blocked'}</span>
        </div>
        {dispatch ? <>
          <p className="muted-copy">The server re-ran eligibility, device freshness and exact-SIM checks when this durable queue was created. A later stale phone/inventory indicator is diagnostic only for this already-created queue; Android still re-checks the frozen exact SIM immediately before every SmsManager submission.</p>
          <div className="definition-grid confirmation-device-grid"><div><dt>Queue created</dt><dd>{dateTime(dispatch.enqueuedAt)}</dd></div><div><dt>Exact subscription</dt><dd>{dispatch.simSubscriptionId}</dd></div><div><dt>Exact SIM slot</dt><dd>SIM {dispatch.simSlotIndex + 1}</dd></div></div>
        </> : <>
          <p className="muted-copy">{preflightSummary(preflight)}</p>
          {preflight && !preflight.ready ? <div className="notice warning-notice"><strong>Authorization is blocked.</strong><ul className="confirmation-blockers">{preflight.blockers.map((blocker, index) => <li key={`${preflight.blockerCodes[index] ?? 'blocker'}-${index}`}>{blocker}</li>)}</ul></div> : null}
          {preflight?.ready ? <div className="definition-grid confirmation-device-grid"><div><dt>Current eligible recipients</dt><dd>{preflight.currentEligibleRecipients.toLocaleString()}</dd></div><div><dt>Phone last seen</dt><dd>{dateTime(preflight.deviceLastSeenAt)}</dd></div><div><dt>Inventory refreshed</dt><dd>{dateTime(preflight.inventoryLastSeenAt)}</dd></div><div><dt>Credential expires</dt><dd>{dateTime(preflight.credentialExpiresAt)}</dd></div></div> : null}
          <div className="button-row"><button className="secondary-button" type="button" disabled={!online || safetyBusy} onClick={() => void refreshSafety()}>{safetyBusy ? 'Checking…' : 'Refresh preflight'}</button></div>
        </>}
      </section>

      <section className="panel send-authorization-panel">
        <div className="panel-heading"><div><p className="eyebrow">Send authorization</p><h2>Short-lived execution permission</h2></div><span className={`badge ${activeAuthorization ? 'badge-success' : authorizationStatus === 'Expired' || authorizationStatus === 'Revoked' ? 'badge-warning' : 'badge-muted'}`}>{authorizationStatus}</span></div>
        {safetyError ? <div className="notice error-notice">{safetyError}</div> : null}
        {authorization ? <div className="definition-grid confirmation-device-grid"><div><dt>Authorized at</dt><dd>{dateTime(authorization.authorizedAt)}</dd></div><div><dt>Expires at</dt><dd>{dateTime(authorization.expiresAt)}</dd></div><div><dt>Exact subscription</dt><dd>{authorization.simSubscriptionId}</dd></div><div><dt>Exact SIM slot</dt><dd>SIM {authorization.simSlotIndex + 1}</dd></div></div> : <p className="muted-copy">No send authorization has been issued for this campaign.</p>}
        <p className="muted-copy">Authorization lasts 5 minutes and can be revoked. It is not a queue job and it does not instruct Android to send SMS.</p>
        <div className="button-row">
          <button className="primary-button" type="button" disabled={!online || safetyBusy || !loaded || Boolean(dispatch) || !canAuthorizeCampaign(preflight, authorization, now)} onClick={() => void authorize()}>{safetyBusy ? 'Working…' : 'Authorize send'}</button>
          {activeAuthorization ? <button className="danger-button" type="button" disabled={!online || safetyBusy} onClick={() => void revoke()}>Revoke authorization</button> : null}
        </div>
      </section>


      <section className="panel durable-queue-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Durable cloud queue</p><h2>Web → Android handoff</h2></div>
          <span className={`badge ${dispatch ? dispatch.status === 'downloaded' ? 'badge-success' : 'badge-warning' : 'badge-muted'}`}>{dispatch ? dispatch.status === 'downloaded' ? 'Downloaded' : dispatch.status === 'leasing' ? 'Leasing' : 'Queued' : 'Not queued'}</span>
        </div>
        <p className="muted-copy">{dispatchSummary(dispatch)}</p>
        {dispatch ? <>
          <div className="definition-grid confirmation-device-grid"><div><dt>Queued jobs</dt><dd>{dispatch.queuedJobs.toLocaleString()}</dd></div><div><dt>Leased jobs</dt><dd>{dispatch.leasedJobs.toLocaleString()}</dd></div><div><dt>Downloaded / ACKed</dt><dd>{dispatch.downloadedJobs.toLocaleString()}</dd></div><div><dt>Downloaded progress</dt><dd>{dispatchProgress(dispatch).toFixed(0)}%</dd></div></div>
          <div className="definition-grid confirmation-device-grid"><div><dt>Enqueued</dt><dd>{dateTime(dispatch.enqueuedAt)}</dd></div><div><dt>Exact subscription</dt><dd>{dispatch.simSubscriptionId}</dd></div><div><dt>Exact SIM slot</dt><dd>SIM {dispatch.simSlotIndex + 1}</dd></div><div><dt>Estimated SMS units</dt><dd>{dispatch.estimatedSmsUnits.toLocaleString()}</dd></div></div>
        </> : <>
          <p className="muted-copy">Queue creation atomically consumes a fresh authorization, re-runs server preflight, and creates one immutable job per confirmed recipient. Duplicate campaign enqueue is prevented by the database.</p>
          <div className="button-row"><button className="primary-button" type="button" disabled={!online || safetyBusy || !loaded || !canCreateDurableQueue(authorization, dispatch, now)} onClick={() => setSendDialogOpen(true)}>{safetyBusy ? 'Working…' : 'Review and start sending'}</button></div>
        </>}
      </section>
          <section className="notice technical-safety-note"><strong>Delivery safety diagnostics:</strong> Android registers an immutable attempt before SmsManager and reports per-part SENT/DELIVERED callbacks. A post-SmsManager callback failure is treated as ambiguous UNKNOWN because SMS delivery may still occur. Callback-derived resend remains disabled; UNKNOWN can only continue without resending.</section>
        </div>
      </details>

      {dispatch ? <section className="panel delivery-attempts-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Delivery details</p><h2>Callback status breakdown</h2></div>
          <span className={`badge ${deliveryStatus?.unresolvedUnknownJobs || deliveryStatus?.failedJobs ? 'badge-warning' : deliveryStatus?.deliveredJobs === deliveryStatus?.recipientCount && deliveryStatus?.recipientCount ? 'badge-success' : 'badge-muted'}`}>{deliveryStatus?.unresolvedUnknownJobs ? 'Attention' : deliveryStatus ? 'Live' : 'Waiting'}</span>
        </div>
        <p className="muted-copy">SENT success and DELIVERED are separate outcomes. UNKNOWN is intentionally kept distinct because BulkText cannot safely assume whether the SMS left the phone.</p>
        {contractHealth ? contractNotices(contractHealth).map((notice) => <div className="notice warning-notice" key={notice}>{notice}</div>) : null}
        {contractHealth?.blockReasons.length ? <ul>{contractHealth.blockReasons.map((reason) => <li key={reason.code}>{reason.code === 'recipient_ineligible' ? 'Consent / suppression check' : reason.code === 'segment_mismatch' ? 'SMS segment mismatch' : reason.code}: {reason.jobs} jobs</li>)}</ul> : null}
        {deliveryStatus ? <div className="delivery-state-breakdown" aria-label="Delivery state breakdown">
          <div><span>Awaiting attempt</span><strong>{deliveryStatus.awaitingAttemptJobs.toLocaleString()}</strong></div>
          <div><span>Prepared</span><strong>{deliveryStatus.preparedJobs.toLocaleString()}</strong></div>
          <div><span>Submitted</span><strong>{deliveryStatus.submittedJobs.toLocaleString()}</strong></div>
          <div><span>Sent</span><strong>{deliveryStatus.sentJobs.toLocaleString()}</strong></div>
          <div><span>Delivered</span><strong>{deliveryStatus.deliveredJobs.toLocaleString()}</strong></div>
          <div><span>Failed</span><strong>{deliveryStatus.failedJobs.toLocaleString()}</strong></div>
          <div className={deliveryStatus.unresolvedUnknownJobs ? 'has-attention' : ''}><span>UNKNOWN</span><strong>{deliveryStatus.unresolvedUnknownJobs.toLocaleString()}</strong></div>
        </div> : <p className="muted-copy">Waiting for the Android gateway to begin reporting delivery status.</p>}
        {deliveryStatus ? <div className="delivery-progress-notes"><span>Known sent {sentProgress(deliveryStatus).toFixed(0)}%</span><span>Delivered {deliveryProgress(deliveryStatus).toFixed(0)}%</span>{resolvedUnknownJobs(deliveryStatus) ? <span>{resolvedUnknownJobs(deliveryStatus).toLocaleString()} UNKNOWN resolved without resend</span> : null}</div> : null}

        <details className="advanced-send-details" open={Boolean(deliveryStatus?.failedJobs || deliveryStatus?.unknownJobs)}>
          <summary>Attempt history</summary>
          <p className="muted-copy">Attempt history is diagnostic. Callback failure never grants automatic resend permission.</p>
          {attempts.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>Recipient</th><th>Attempt</th><th>State</th><th>Resend safety</th><th>Updated</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.attemptId}><td>{attempt.sourceRowNumber}</td><td>{maskRecipientNumber(attempt.normalizedE164)}</td><td>#{attempt.attemptNumber}</td><td><span className={`badge ${attemptBadgeClass(attempt.state)}`}>{attempt.state.toUpperCase()}</span>{attempt.terminalReason ? <small>{attempt.terminalReason}</small> : null}{attempt.resolution === 'skip_without_retry' ? <small>Resolved without resend.</small> : null}</td><td>{attempt.state === 'unknown' || attempt.state === 'failed' ? <span className="badge badge-muted">No automatic resend</span> : <span className="badge badge-muted">Not applicable</span>}</td><td>{dateTime(attempt.deliveredAt || attempt.sentAt || attempt.failedAt || attempt.unknownAt || attempt.submittedAt || attempt.createdAt)}</td></tr>)}</tbody></table></div> : <p className="muted-copy">No attempt history yet.</p>}
        </details>
      </section> : null}

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Recipients</p><h2>Frozen personalized messages</h2></div><span className="badge badge-muted">First {Math.min(100, campaign.recipientCount)}</span></div>{recipients.length === 0 ? <EmptyState title="No recipients">This campaign has no stored recipients.</EmptyState> : <div className="table-wrap campaign-recipient-table-wrap"><table className="data-table campaign-recipient-table"><thead><tr><th>Recipient</th><th>Message</th><th>SMS</th><th>Eligibility</th></tr></thead><tbody>{recipients.map((recipient) => <tr key={recipient.recipientId}><td data-label="Recipient"><strong>{recipient.displayName || 'Recipient'}</strong><small>{recipient.normalizedE164}</small></td><td data-label="Message" className="campaign-message-cell">{recipient.renderedMessage}</td><td data-label="SMS">{recipient.smsEncoding}<small>{recipient.segmentCount} segment{recipient.segmentCount === 1 ? '' : 's'} · {recipient.characterCount} chars</small></td><td data-label="Eligibility"><span className="badge badge-success">Eligible at confirmation</span><small>Current eligibility is rechecked by preflight.</small></td></tr>)}</tbody></table></div>}{campaign.recipientCount > recipients.length ? <p className="muted-copy">Showing the first {recipients.length} recipients. The full snapshot contains {campaign.recipientCount} recipients.</p> : null}</section>

      <ActionDialog
        open={recoveryDialogOpen}
        eyebrow="Delivery safety"
        title="Continue without resending UNKNOWN results?"
        description="BulkText will resolve the current UNKNOWN results without sending those recipients again, then allow remaining safe work to continue."
        confirmLabel="Continue without resending"
        busyLabel="Requesting…"
        busy={recoveryBusy}
        onCancel={() => setRecoveryDialogOpen(false)}
        onConfirm={() => requestRecovery('skip_unknown')}
      >
        <div className="action-dialog-summary">
          <div><span>UNKNOWN results</span><strong>{deliveryStatus?.unresolvedUnknownJobs.toLocaleString() ?? '0'}</strong></div>
          <div><span>Automatic resend</span><strong>Disabled</strong></div>
        </div>
        <p className="send-dialog-warning"><strong>No SENT or DELIVERED claim will be made for these UNKNOWN recipients.</strong></p>
      </ActionDialog>

      <ActionDialog
        open={sendDialogOpen}
        eyebrow="Final send confirmation"
        title="Start sending?"
        description="BulkText runs one final phone, SIM and recipient check. If it passes, sending is queued immediately and the Android gateway can begin sending."
        confirmLabel="Start sending"
        busyLabel="Starting…"
        busy={safetyBusy}
        onCancel={() => setSendDialogOpen(false)}
        onConfirm={sendToPhone}
      >
        <div className="action-dialog-summary">
          <div><span>Campaign</span><strong>{campaign.title}</strong></div>
          <div><span>Recipients</span><strong>{campaign.recipientCount.toLocaleString()}</strong></div>
          <div><span>Estimated SMS</span><strong>{campaign.estimatedSmsUnits.toLocaleString()}</strong></div>
          <div><span>Sending from</span><strong>{phone} · {campaign.simCarrierName || campaign.simDisplayName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</strong></div>
        </div>
        <p className="send-dialog-warning"><strong>Sending begins immediately after the final safety check.</strong></p>
      </ActionDialog>
    </div>
  )
}
