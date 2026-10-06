import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { getCampaignConfirmation, listCampaignConfirmationRecipients, type CampaignConfirmationDetail, type CampaignConfirmationRecipient } from '../lib/campaignConfirmationApi'
import { canCreateDurableQueue, dispatchProgress, dispatchSummary, type CampaignDispatch } from '../lib/durableQueue'
import { enqueueCampaignDispatch, getCampaignDispatch } from '../lib/durableQueueApi'
import { attemptBadgeClass, deliveryProgress, deliverySummary, sentProgress, type CampaignDeliveryStatus, type CampaignMessageAttempt, type MessageRecoveryAction } from '../lib/deliveryAttempts'
import { getCampaignDeliveryStatus, listCampaignMessageAttempts, requestCampaignMessageRecovery } from '../lib/deliveryAttemptsApi'
import { errorMessage } from '../lib/errors'
import { authorizationIsActive, canAuthorizeCampaign, preflightSummary, type CampaignSendAuthorization, type CampaignSendPreflight } from '../lib/gatewayPreflight'
import { authorizeCampaignSend, getCampaignSendPreflight, getLatestCampaignSendAuthorization, revokeCampaignSendAuthorization } from '../lib/gatewayPreflightApi'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string | null) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function CampaignDetailPage() {
  const { workspace } = useWorkspace()
  const { campaignId = '' } = useParams()
  const [campaign, setCampaign] = useState<CampaignConfirmationDetail | null>(null)
  const [recipients, setRecipients] = useState<CampaignConfirmationRecipient[]>([])
  const [preflight, setPreflight] = useState<CampaignSendPreflight | null>(null)
  const [authorization, setAuthorization] = useState<CampaignSendAuthorization | null>(null)
  const [dispatch, setDispatch] = useState<CampaignDispatch | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<CampaignDeliveryStatus | null>(null)
  const [attempts, setAttempts] = useState<CampaignMessageAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [safetyBusy, setSafetyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safetyError, setSafetyError] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [now, setNow] = useState(() => new Date())

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
      getCampaignDispatch(workspace.id, campaignId),
    ])
      .then(([nextCampaign, nextRecipients, nextPreflight, nextAuthorization, nextDispatch]) => {
        if (cancelled) return
        setCampaign(nextCampaign)
        setRecipients(nextRecipients)
        setPreflight(nextPreflight)
        setAuthorization(nextAuthorization)
        setDispatch(nextDispatch)
      })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not load the confirmed campaign.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace, campaignId])

  async function refreshDelivery() {
    if (!workspace || !campaignId || !dispatch) {
      setDeliveryStatus(null)
      setAttempts([])
      return
    }
    try {
      const [nextStatus, nextAttempts] = await Promise.all([
        getCampaignDeliveryStatus(workspace.id, campaignId),
        listCampaignMessageAttempts(workspace.id, campaignId, 100),
      ])
      setDeliveryStatus(nextStatus)
      setAttempts(nextAttempts)
      setDeliveryError(null)
    } catch (reason) {
      setDeliveryError(errorMessage(reason, 'Could not refresh SMS callback status.'))
    }
  }

  useEffect(() => {
    if (!workspace || !campaignId || !dispatch) {
      setDeliveryStatus(null)
      setAttempts([])
      return
    }
    let cancelled = false
    const poll = async () => {
      try {
        const [nextStatus, nextAttempts] = await Promise.all([
          getCampaignDeliveryStatus(workspace.id, campaignId),
          listCampaignMessageAttempts(workspace.id, campaignId, 100),
        ])
        if (cancelled) return
        setDeliveryStatus(nextStatus)
        setAttempts(nextAttempts)
        setDeliveryError(null)
      } catch (reason) {
        if (!cancelled) setDeliveryError(errorMessage(reason, 'Could not refresh SMS callback status.'))
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 5_000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [workspace, campaignId, dispatch?.dispatchId])

  async function requestRecovery(action: MessageRecoveryAction) {
    if (!workspace || !campaignId || !dispatch || recoveryBusy) return
    const message = action === 'safe_retry'
      ? 'Request explicit retry only for failures where Android received terminal SENT failures for every SMS part and zero parts reported SENT? UNKNOWN or mixed outcomes will NOT be retried.'
      : 'Resolve all current UNKNOWN jobs without resending them? This clears the Android safety pause so remaining jobs can continue, but the UNKNOWN recipients will not be sent again.'
    if (!window.confirm(message)) return
    setRecoveryBusy(true)
    setDeliveryError(null)
    try {
      const count = await requestCampaignMessageRecovery(workspace.id, campaignId, action)
      if (count === 0) {
        setDeliveryError(action === 'safe_retry' ? 'No new safe-retry eligible failures were found.' : 'No unresolved UNKNOWN attempts were found.')
      }
      await refreshDelivery()
    } catch (reason) {
      setDeliveryError(errorMessage(reason, 'Could not request message recovery.'))
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function refreshSafety() {
    if (!workspace || !campaignId) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const [nextPreflight, nextAuthorization, nextDispatch] = await Promise.all([
        getCampaignSendPreflight(workspace.id, campaignId),
        getLatestCampaignSendAuthorization(workspace.id, campaignId),
        getCampaignDispatch(workspace.id, campaignId),
      ])
      setPreflight(nextPreflight)
      setAuthorization(nextAuthorization)
      setDispatch(nextDispatch)
      setNow(new Date())
    } catch (reason) {
      setSafetyError(errorMessage(reason, 'Could not refresh gateway preflight.'))
    } finally {
      setSafetyBusy(false)
    }
  }

  async function authorize() {
    if (!workspace || !campaignId || dispatch || !canAuthorizeCampaign(preflight, authorization, now)) return
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
    if (!workspace || !campaignId || !authorization || !authorizationIsActive(authorization, now)) return
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


  async function createQueue() {
    if (!workspace || !campaignId || !authorization || !canCreateDurableQueue(authorization, dispatch, now)) return
    if (!window.confirm('Create the durable cloud queue from this immutable campaign snapshot? This still does not send any SMS.')) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const nextDispatch = await enqueueCampaignDispatch(workspace.id, campaignId, authorization.authorizationId)
      const nextAuthorization = await getLatestCampaignSendAuthorization(workspace.id, campaignId)
      setDispatch(nextDispatch)
      setAuthorization(nextAuthorization)
      setNow(new Date())
    } catch (reason) {
      const message = errorMessage(reason, 'Could not create the durable cloud queue.')
      await refreshSafety()
      setSafetyError(message)
    } finally {
      setSafetyBusy(false)
    }
  }


  async function sendToPhone() {
    if (!workspace || !campaignId || dispatch) return
    if (!window.confirm('Send this confirmed campaign through the paired Android gateway? BulkText will re-run exact-SIM preflight, create the durable queue, and the enabled Android 0.18 background gateway will execute it without requiring you to return to the phone.')) return
    setSafetyBusy(true)
    setSafetyError(null)
    try {
      const freshPreflight = await getCampaignSendPreflight(workspace.id, campaignId)
      setPreflight(freshPreflight)
      if (!freshPreflight.ready) {
        setSafetyError(freshPreflight.blockers.join(' ' ) || 'Gateway preflight is blocked.')
        return
      }
      const freshAuthorization = await authorizeCampaignSend(workspace.id, campaignId)
      setAuthorization(freshAuthorization)
      const nextDispatch = await enqueueCampaignDispatch(workspace.id, campaignId, freshAuthorization.authorizationId)
      setDispatch(nextDispatch)
      setAuthorization(await getLatestCampaignSendAuthorization(workspace.id, campaignId))
      setNow(new Date())
    } catch (reason) {
      const message = errorMessage(reason, 'Could not send this campaign to Android.')
      try { await refreshSafety() } catch {}
      setSafetyError(message)
    } finally {
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

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading"><div><p className="eyebrow">Confirmed campaign</p><h1>{campaign.title}</h1><p>Immutable execution snapshot confirmed {dateTime(campaign.confirmedAt)}. Send to Android runs the exact-SIM safety checks, authorization and durable queue handoff in one action.</p></div><Link className="secondary-button" to="/campaigns">Back to campaigns</Link></section>

      <section className="metric-grid confirmation-metrics">
        <article className="metric-card"><span>Recipients</span><h2>{campaign.recipientCount.toLocaleString()}</h2><p>Frozen recipient snapshot.</p></article>
        <article className="metric-card"><span>Estimated SMS units</span><h2>{campaign.estimatedSmsUnits.toLocaleString()}</h2><p>Estimate only.</p></article>
        <article className="metric-card"><span>Encoding</span><h2>{encoding}</h2><p>{campaign.gsm7Recipients} GSM-7 · {campaign.unicodeRecipients} Unicode</p></article>
        <article className="metric-card"><span>Segments</span><h2>{campaign.minimumSegments}–{campaign.maximumSegments}</h2><p>{campaign.averageSegments.toFixed(2)} average.</p></article>
      </section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Frozen message</p><h2>Template snapshot</h2></div><span className="badge badge-success">Confirmed</span></div><pre className="campaign-template-preview">{campaign.messageTemplateSnapshot}</pre></section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Phone &amp; SIM</p><h2>Confirmed sending identity</h2></div></div><div className="definition-grid confirmation-device-grid"><div><dt>Phone</dt><dd>{phone}</dd></div><div><dt>Selected SIM</dt><dd>{campaign.simCarrierName || campaign.simDisplayName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</dd></div><div><dt>Subscription</dt><dd>{campaign.simSubscriptionId}</dd></div><div><dt>Phone last seen at confirmation</dt><dd>{dateTime(campaign.gatewayLastSeenAt)}</dd></div></div></section>

      <section className="panel simple-send-panel">
        <div className="panel-heading"><div><p className="eyebrow">Simple send</p><h2>{dispatch ? 'Campaign is queued on Android' : 'Send to Android'}</h2></div><span className={`badge ${dispatch ? 'badge-success' : preflight?.ready ? 'badge-success' : 'badge-warning'}`}>{dispatch ? 'Queued' : preflight?.ready ? 'Ready' : 'Check required'}</span></div>
        {safetyError ? <div className="notice error-notice">{safetyError}</div> : null}
        {dispatch ? <><p className="muted-copy">The durable cloud queue has been created for the exact confirmed SIM. Android 0.18 background gateway can execute newly authorized jobs automatically while the phone stays in the background; manual queue/send controls are recovery tools only.</p><p className="muted-copy">{dispatchSummary(dispatch)}</p></> : <><p className="muted-copy">One click re-runs current eligibility, phone/SIM freshness and exact SIM identity, then creates the authorized durable queue. It never falls back to another SIM.</p><div className="button-row"><button className="primary-button" type="button" disabled={safetyBusy} onClick={() => void sendToPhone()}>{safetyBusy ? 'Checking & queueing…' : 'Send to Android'}</button></div></>}
        <details className="advanced-send-details"><summary>Advanced send controls</summary><p className="muted-copy">The detailed preflight, authorization and queue panels below remain available for diagnostics and recovery.</p></details>
      </section>

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
          <div className="button-row"><button className="secondary-button" type="button" disabled={safetyBusy} onClick={() => void refreshSafety()}>{safetyBusy ? 'Checking…' : 'Refresh preflight'}</button></div>
        </>}
      </section>

      <section className="panel send-authorization-panel">
        <div className="panel-heading"><div><p className="eyebrow">Send authorization</p><h2>Short-lived execution permission</h2></div><span className={`badge ${activeAuthorization ? 'badge-success' : authorizationStatus === 'Expired' || authorizationStatus === 'Revoked' ? 'badge-warning' : 'badge-muted'}`}>{authorizationStatus}</span></div>
        {safetyError ? <div className="notice error-notice">{safetyError}</div> : null}
        {authorization ? <div className="definition-grid confirmation-device-grid"><div><dt>Authorized at</dt><dd>{dateTime(authorization.authorizedAt)}</dd></div><div><dt>Expires at</dt><dd>{dateTime(authorization.expiresAt)}</dd></div><div><dt>Exact subscription</dt><dd>{authorization.simSubscriptionId}</dd></div><div><dt>Exact SIM slot</dt><dd>SIM {authorization.simSlotIndex + 1}</dd></div></div> : <p className="muted-copy">No send authorization has been issued for this campaign.</p>}
        <p className="muted-copy">Authorization lasts 5 minutes and can be revoked. It is not a queue job and it does not instruct Android to send SMS.</p>
        <div className="button-row">
          <button className="primary-button" type="button" disabled={safetyBusy || Boolean(dispatch) || !canAuthorizeCampaign(preflight, authorization, now)} onClick={() => void authorize()}>{safetyBusy ? 'Working…' : 'Authorize send'}</button>
          {activeAuthorization ? <button className="danger-button" type="button" disabled={safetyBusy} onClick={() => void revoke()}>Revoke authorization</button> : null}
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
          <div className="button-row"><button className="primary-button" type="button" disabled={safetyBusy || !canCreateDurableQueue(authorization, dispatch, now)} onClick={() => void createQueue()}>{safetyBusy ? 'Working…' : 'Create durable queue'}</button></div>
        </>}
      </section>

      {dispatch ? <section className="panel delivery-attempts-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">SMS callbacks &amp; recovery</p><h2>SENT / DELIVERED status</h2></div>
          <span className={`badge ${deliveryStatus?.unresolvedUnknownJobs ? 'badge-warning' : deliveryStatus?.deliveredJobs === deliveryStatus?.recipientCount && deliveryStatus?.recipientCount ? 'badge-success' : 'badge-muted'}`}>{deliveryStatus?.unresolvedUnknownJobs ? 'Recovery required' : deliveryStatus ? 'Tracking' : 'Waiting'}</span>
        </div>
        {deliveryError ? <div className="notice error-notice">{deliveryError}</div> : null}
        <p className="muted-copy">{deliverySummary(deliveryStatus)}</p>
        {deliveryStatus ? <>
          <div className="metric-grid confirmation-metrics">
            <article className="metric-card"><span>Awaiting attempt</span><h2>{deliveryStatus.awaitingAttemptJobs.toLocaleString()}</h2><p>Downloaded but not yet registered at the SmsManager boundary.</p></article>
            <article className="metric-card"><span>Prepared / submitted</span><h2>{(deliveryStatus.preparedJobs + deliveryStatus.submittedJobs).toLocaleString()}</h2><p>{deliveryStatus.preparedJobs.toLocaleString()} prepared · {deliveryStatus.submittedJobs.toLocaleString()} submitted. Neither means carrier SENT.</p></article>
            <article className="metric-card"><span>Known sent</span><h2>{(deliveryStatus.sentJobs + deliveryStatus.deliveredJobs).toLocaleString()}</h2><p>{sentProgress(deliveryStatus).toFixed(0)}% of recipients have complete SENT success.</p></article>
            <article className="metric-card"><span>Delivered</span><h2>{deliveryStatus.deliveredJobs.toLocaleString()}</h2><p>{deliveryProgress(deliveryStatus).toFixed(0)}% reported DELIVERED.</p></article>
            <article className="metric-card"><span>Failed</span><h2>{deliveryStatus.failedJobs.toLocaleString()}</h2><p>Callback-derived failure never authorizes resend in 0.18.1.</p></article>
            <article className="metric-card"><span>Unresolved UNKNOWN</span><h2>{deliveryStatus.unresolvedUnknownJobs.toLocaleString()}</h2><p>Never automatically retried.</p></article>
          </div>
          {deliveryStatus.recoveryRequestedJobs > 0 ? <div className="notice warning-notice"><strong>Recovery queued.</strong> {deliveryStatus.recoveryRequestedJobs.toLocaleString()} request{deliveryStatus.recoveryRequestedJobs === 1 ? '' : 's'} waiting for the paired Android gateway.</div> : null}
          <div className="button-row">
            {deliveryStatus.unresolvedUnknownJobs > 0 ? <button className="secondary-button" type="button" disabled={recoveryBusy} onClick={() => void requestRecovery('skip_unknown')}>{recoveryBusy ? 'Working…' : `Continue without resending ${deliveryStatus.unresolvedUnknownJobs} UNKNOWN`}</button> : null}
            <button className="secondary-button" type="button" disabled={recoveryBusy} onClick={() => void refreshDelivery()}>Refresh callbacks</button>
          </div>
        </> : <p className="muted-copy">No Android attempt has been registered yet. Android 0.18 registers every attempt in cloud before calling SmsManager.</p>}

        <details className="advanced-send-details" open={Boolean(deliveryStatus?.failedJobs || deliveryStatus?.unknownJobs)}>
          <summary>Attempt history</summary>
          <p className="muted-copy">Every retry receives a new immutable attempt number. SENT success and DELIVERED are separate outcomes; delivery failure never authorizes a resend.</p>
          {attempts.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Row</th><th>Recipient</th><th>Attempt</th><th>State</th><th>Resend safety</th><th>Updated</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.attemptId}><td>{attempt.sourceRowNumber}</td><td>{attempt.normalizedE164}</td><td>#{attempt.attemptNumber}</td><td><span className={`badge ${attemptBadgeClass(attempt.state)}`}>{attempt.state.toUpperCase()}</span>{attempt.terminalReason ? <small>{attempt.terminalReason}</small> : null}{attempt.resolution === 'skip_without_retry' ? <small>Resolved without resend.</small> : null}</td><td>{attempt.state === 'unknown' || attempt.state === 'failed' ? <span className="badge badge-muted">No resend from callback failure</span> : <span className="badge badge-muted">Not applicable</span>}</td><td>{dateTime(attempt.deliveredAt || attempt.sentAt || attempt.failedAt || attempt.unknownAt || attempt.submittedAt || attempt.createdAt)}</td></tr>)}</tbody></table></div> : <p className="muted-copy">No attempt history yet.</p>}
        </details>
      </section> : null}

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Recipients</p><h2>Frozen personalized messages</h2></div><span className="badge badge-muted">First {Math.min(100, campaign.recipientCount)}</span></div>{recipients.length === 0 ? <EmptyState title="No recipients">This campaign has no stored recipients.</EmptyState> : <div className="table-wrap"><table className="data-table campaign-recipient-table"><thead><tr><th>Recipient</th><th>Message</th><th>SMS</th><th>Eligibility</th></tr></thead><tbody>{recipients.map((recipient) => <tr key={recipient.recipientId}><td><strong>{recipient.displayName || 'Recipient'}</strong><small>{recipient.normalizedE164}</small></td><td className="campaign-message-cell">{recipient.renderedMessage}</td><td>{recipient.smsEncoding}<small>{recipient.segmentCount} segment{recipient.segmentCount === 1 ? '' : 's'} · {recipient.characterCount} chars</small></td><td><span className="badge badge-success">Eligible at confirmation</span><small>Current eligibility is rechecked by preflight.</small></td></tr>)}</tbody></table></div>}{campaign.recipientCount > recipients.length ? <p className="muted-copy">Showing the first {recipients.length} recipients. The full snapshot contains {campaign.recipientCount} recipients.</p> : null}</section>

      <section className="notice warning-notice"><strong>0.18.1 safety boundary:</strong> Android registers an immutable attempt before SmsManager and reports per-part SENT/DELIVERED callbacks. Any post-SmsManager callback failure is treated as ambiguous UNKNOWN, because real-device acceptance proved that SMS delivery can still occur. Callback-derived resend is disabled; continue UNKNOWN only without resending.</section>
    </div>
  )
}
