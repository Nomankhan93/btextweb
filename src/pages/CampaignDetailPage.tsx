import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { getCampaignConfirmation, listCampaignConfirmationRecipients, type CampaignConfirmationDetail, type CampaignConfirmationRecipient } from '../lib/campaignConfirmationApi'
import { canCreateDurableQueue, dispatchProgress, dispatchSummary, type CampaignDispatch } from '../lib/durableQueue'
import { enqueueCampaignDispatch, getCampaignDispatch } from '../lib/durableQueueApi'
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
  const [loading, setLoading] = useState(true)
  const [safetyBusy, setSafetyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [safetyError, setSafetyError] = useState<string | null>(null)
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
      <section className="page-heading recipient-heading"><div><p className="eyebrow">Confirmed campaign</p><h1>{campaign.title}</h1><p>Immutable execution snapshot confirmed {dateTime(campaign.confirmedAt)}. Gateway preflight, short-lived authorization, and durable cloud queueing are available. SMS sending remains disabled.</p></div><Link className="secondary-button" to="/campaigns">Back to campaigns</Link></section>

      <section className="metric-grid confirmation-metrics">
        <article className="metric-card"><span>Recipients</span><h2>{campaign.recipientCount.toLocaleString()}</h2><p>Frozen recipient snapshot.</p></article>
        <article className="metric-card"><span>Estimated SMS units</span><h2>{campaign.estimatedSmsUnits.toLocaleString()}</h2><p>Estimate only.</p></article>
        <article className="metric-card"><span>Encoding</span><h2>{encoding}</h2><p>{campaign.gsm7Recipients} GSM-7 · {campaign.unicodeRecipients} Unicode</p></article>
        <article className="metric-card"><span>Segments</span><h2>{campaign.minimumSegments}–{campaign.maximumSegments}</h2><p>{campaign.averageSegments.toFixed(2)} average.</p></article>
      </section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Frozen message</p><h2>Template snapshot</h2></div><span className="badge badge-success">Confirmed</span></div><pre className="campaign-template-preview">{campaign.messageTemplateSnapshot}</pre></section>

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Phone &amp; SIM</p><h2>Confirmed sending identity</h2></div></div><div className="definition-grid confirmation-device-grid"><div><dt>Phone</dt><dd>{phone}</dd></div><div><dt>Selected SIM</dt><dd>{campaign.simCarrierName || campaign.simDisplayName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</dd></div><div><dt>Subscription</dt><dd>{campaign.simSubscriptionId}</dd></div><div><dt>Phone last seen at confirmation</dt><dd>{dateTime(campaign.gatewayLastSeenAt)}</dd></div></div></section>

      <section className="panel gateway-preflight-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Gateway preflight</p><h2>Current send-safety checks</h2></div>
          <span className={`badge ${preflight?.ready ? 'badge-success' : 'badge-warning'}`}>{preflight?.ready ? 'Ready' : 'Blocked'}</span>
        </div>
        <p className="muted-copy">{preflightSummary(preflight)}</p>
        {preflight && !preflight.ready ? <div className="notice warning-notice"><strong>Authorization is blocked.</strong><ul className="confirmation-blockers">{preflight.blockers.map((blocker, index) => <li key={`${preflight.blockerCodes[index] ?? 'blocker'}-${index}`}>{blocker}</li>)}</ul></div> : null}
        {preflight?.ready ? <div className="definition-grid confirmation-device-grid"><div><dt>Current eligible recipients</dt><dd>{preflight.currentEligibleRecipients.toLocaleString()}</dd></div><div><dt>Phone last seen</dt><dd>{dateTime(preflight.deviceLastSeenAt)}</dd></div><div><dt>Inventory refreshed</dt><dd>{dateTime(preflight.inventoryLastSeenAt)}</dd></div><div><dt>Credential expires</dt><dd>{dateTime(preflight.credentialExpiresAt)}</dd></div></div> : null}
        <div className="button-row"><button className="secondary-button" type="button" disabled={safetyBusy} onClick={() => void refreshSafety()}>{safetyBusy ? 'Checking…' : 'Refresh preflight'}</button></div>
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

      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Recipients</p><h2>Frozen personalized messages</h2></div><span className="badge badge-muted">First {Math.min(100, campaign.recipientCount)}</span></div>{recipients.length === 0 ? <EmptyState title="No recipients">This campaign has no stored recipients.</EmptyState> : <div className="table-wrap"><table className="data-table campaign-recipient-table"><thead><tr><th>Recipient</th><th>Message</th><th>SMS</th><th>Eligibility</th></tr></thead><tbody>{recipients.map((recipient) => <tr key={recipient.recipientId}><td><strong>{recipient.displayName || 'Recipient'}</strong><small>{recipient.normalizedE164}</small></td><td className="campaign-message-cell">{recipient.renderedMessage}</td><td>{recipient.smsEncoding}<small>{recipient.segmentCount} segment{recipient.segmentCount === 1 ? '' : 's'} · {recipient.characterCount} chars</small></td><td><span className="badge badge-success">Eligible at confirmation</span><small>Current eligibility is rechecked by preflight.</small></td></tr>)}</tbody></table></div>}{campaign.recipientCount > recipients.length ? <p className="muted-copy">Showing the first {recipients.length} recipients. The full snapshot contains {campaign.recipientCount} recipients.</p> : null}</section>

      <section className="notice warning-notice"><strong>0.16 safety boundary:</strong> the cloud queue is durable and Android may lease/download/ACK jobs, but no job reaches SmsManager in this phase. Downloaded does not mean submitted or sent.</section>
    </div>
  )
}
