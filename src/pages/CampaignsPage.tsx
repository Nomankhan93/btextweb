import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { deleteCampaign, deleteCampaignHistory, listCampaignConfirmations, type ConfirmedCampaignSummary } from '../lib/campaignConfirmationApi'
import { errorMessage } from '../lib/errors'
import { workflowRoutes } from '../lib/productNavigation'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function CampaignsPage() {
  const { workspace } = useWorkspace()
  const [campaigns, setCampaigns] = useState<ConfirmedCampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() {
    if (!workspace) return
    const rows = await listCampaignConfirmations(workspace.id)
    setCampaigns(rows)
  }

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void listCampaignConfirmations(workspace.id)
      .then((rows) => { if (!cancelled) setCampaigns(rows) })
      .catch((reason) => { if (!cancelled) setError(errorMessage(reason, 'Could not load campaigns.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace])

  async function removeCampaign(campaign: ConfirmedCampaignSummary) {
    if (!workspace || deletingId || historyBusy) return
    if (!window.confirm(`Delete “${campaign.title}” from campaign history?\n\nBulkText will refuse deletion if Android has in-flight/downloaded work, unresolved UNKNOWN, pending recovery, or callbacks that are not safely terminal. Queued jobs that were never downloaded will be cancelled.`)) return
    setDeletingId(campaign.campaignId)
    setError(null)
    setNotice(null)
    try {
      const result = await deleteCampaign(workspace.id, campaign.campaignId)
      setCampaigns((rows) => rows.filter((row) => row.campaignId !== campaign.campaignId))
      setNotice(result.cancelledQueuedJobs > 0
        ? `Deleted “${result.title}” and cancelled ${result.cancelledQueuedJobs} queued job${result.cancelledQueuedJobs === 1 ? '' : 's'} that had not been downloaded.`
        : `Deleted “${result.title}” from campaign history.`)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not delete this campaign.'))
    } finally {
      setDeletingId(null)
    }
  }

  async function cleanHistory() {
    if (!workspace || historyBusy || deletingId || campaigns.length === 0) return
    if (!window.confirm('Delete all campaign history that is currently safe to remove?\n\nBulkText will KEEP any campaign with in-flight/downloaded Android work, unresolved UNKNOWN, pending recovery, or incomplete callbacks. Queued jobs that were never downloaded may be cancelled.')) return
    setHistoryBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await deleteCampaignHistory(workspace.id)
      await reload()
      const skipped = result.skippedCount > 0 ? ` ${result.skippedCount} active/unsafe campaign${result.skippedCount === 1 ? ' was' : 's were'} kept.` : ''
      const cancelled = result.cancelledQueuedJobs > 0 ? ` ${result.cancelledQueuedJobs} never-downloaded queued job${result.cancelledQueuedJobs === 1 ? ' was' : 's were'} cancelled.` : ''
      setNotice(`Deleted ${result.deletedCount} campaign${result.deletedCount === 1 ? '' : 's'} from history.${skipped}${cancelled}`)
    } catch (reason) {
      setError(errorMessage(reason, 'Could not clean campaign history.'))
    } finally {
      setHistoryBusy(false)
    }
  }

  if (!workspace) return null

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div><p className="eyebrow">Campaigns</p><h1>Campaigns</h1><p>Create a campaign, upload the list, write the message and review before sending through your exact selected SIM.</p></div>
        <Link className="primary-button" to="/campaigns/new">+ New campaign</Link>
      </section>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {notice ? <div className="notice success-notice">{notice}</div> : null}

      <section className="panel simple-flow-card">
        <div className="panel-heading"><div><p className="eyebrow">Simple flow</p><h2>Campaign → List → Message → Send</h2></div><Link className="primary-link" to="/campaigns/new">Start campaign</Link></div>
        <div className="simple-flow-steps">
          <div><strong>1. Campaign</strong><span>Name the campaign.</span></div>
          <div><strong>2. List</strong><span>Upload CSV/XLSX. BulkText finds the mobile numbers.</span></div>
          <div><strong>3. Message</strong><span>Type the SMS and review estimated usage.</span></div>
          <div><strong>4. Send</strong><span>Confirm the exact recipients, phone and SIM, then queue to Android.</span></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Confirmed campaigns</p><h2>Campaign history</h2></div>
          <div className="button-row"><span className="badge badge-muted">{campaigns.length}</span>{campaigns.length > 0 ? <button className="danger-button" type="button" disabled={historyBusy || Boolean(deletingId)} onClick={() => void cleanHistory()}>{historyBusy ? 'Cleaning…' : 'Delete safe history'}</button> : null}</div>
        </div>
        <p className="muted-copy">Deletion is safety-gated. BulkText keeps campaigns that Android may still execute, reconcile, or recover.</p>
        {loading ? <LoadingState label="Loading campaigns…" /> : campaigns.length === 0 ? <EmptyState title="No confirmed campaigns yet">Use New campaign to create the first one.</EmptyState> : (
          <div className="table-wrap"><table className="data-table campaign-list-table"><thead><tr><th>Campaign</th><th>Recipients</th><th>Estimated SMS</th><th>Phone &amp; SIM</th><th>Confirmed</th><th /></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.campaignId}><td><strong>{campaign.title}</strong><small>{campaign.encodingSummary} · {campaign.minimumSegments}–{campaign.maximumSegments} segments</small></td><td>{campaign.recipientCount.toLocaleString()}</td><td>{campaign.estimatedSmsUnits.toLocaleString()}</td><td>{campaign.gatewayDeviceName}<small>{campaign.simCarrierName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</small></td><td>{dateTime(campaign.confirmedAt)}</td><td><div className="button-row table-actions"><Link className="primary-link" to={`/campaigns/${campaign.campaignId}`}>Open</Link><button className="danger-link" type="button" disabled={historyBusy || deletingId === campaign.campaignId} onClick={() => void removeCampaign(campaign)}>{deletingId === campaign.campaignId ? 'Deleting…' : 'Delete'}</button></div></td></tr>)}</tbody></table></div>
        )}
      </section>

      <details className="panel advanced-workflow-panel">
        <summary>Advanced recipient &amp; compliance tools</summary>
        <div className="button-row advanced-tool-links"><Link className="secondary-button" to={workflowRoutes.recipients}>Recipient imports</Link><Link className="secondary-button" to={workflowRoutes.consent}>Consent / do-not-send</Link><Link className="secondary-button" to={workflowRoutes.composer}>Message drafts</Link></div>
      </details>

      <section className="notice warning-notice">Web confirmation, exact-SIM preflight, short-lived authorization and durable cloud queueing remain enforced. Campaign deletion never bypasses Android execution/recovery safety; active or ambiguous campaigns are retained.</section>
    </div>
  )
}
