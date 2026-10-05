import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { listCampaignConfirmations, type ConfirmedCampaignSummary } from '../lib/campaignConfirmationApi'
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
  const [error, setError] = useState<string | null>(null)

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

  if (!workspace) return null

  return (
    <div className="page-stack">
      <section className="page-heading recipient-heading">
        <div><p className="eyebrow">Campaigns</p><h1>Campaigns</h1><p>Create a campaign, upload the list, write the message and review before sending through your exact selected SIM.</p></div>
        <Link className="primary-button" to="/campaigns/new">+ New campaign</Link>
      </section>
      {error ? <div className="notice error-notice">{error}</div> : null}

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
        <div className="panel-heading"><div><p className="eyebrow">Confirmed campaigns</p><h2>Campaign history</h2></div><span className="badge badge-muted">{campaigns.length}</span></div>
        {loading ? <LoadingState label="Loading campaigns…" /> : campaigns.length === 0 ? <EmptyState title="No confirmed campaigns yet">Use New campaign to create the first one.</EmptyState> : (
          <div className="table-wrap"><table className="data-table campaign-list-table"><thead><tr><th>Campaign</th><th>Recipients</th><th>Estimated SMS</th><th>Phone &amp; SIM</th><th>Confirmed</th><th /></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.campaignId}><td><strong>{campaign.title}</strong><small>{campaign.encodingSummary} · {campaign.minimumSegments}–{campaign.maximumSegments} segments</small></td><td>{campaign.recipientCount.toLocaleString()}</td><td>{campaign.estimatedSmsUnits.toLocaleString()}</td><td>{campaign.gatewayDeviceName}<small>{campaign.simCarrierName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</small></td><td>{dateTime(campaign.confirmedAt)}</td><td><Link className="primary-link" to={`/campaigns/${campaign.campaignId}`}>Open</Link></td></tr>)}</tbody></table></div>
        )}
      </section>

      <details className="panel advanced-workflow-panel">
        <summary>Advanced recipient &amp; compliance tools</summary>
        <div className="button-row advanced-tool-links"><Link className="secondary-button" to={workflowRoutes.recipients}>Recipient imports</Link><Link className="secondary-button" to={workflowRoutes.consent}>Consent / do-not-send</Link><Link className="secondary-button" to={workflowRoutes.composer}>Message drafts</Link></div>
      </details>

      <section className="notice warning-notice">Web confirmation, exact-SIM preflight, short-lived authorization and durable cloud queueing remain enforced. With Android 0.17+, downloaded jobs can be explicitly submitted on the bound SIM; cloud SENT/DELIVERED callbacks and scheduling remain future work.</section>
    </div>
  )
}
