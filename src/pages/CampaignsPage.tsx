import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../components/StateViews'
import { listCampaignConfirmations, type ConfirmedCampaignSummary } from '../lib/campaignConfirmationApi'
import { errorMessage } from '../lib/errors'
import { workflowRoutes } from '../lib/productNavigation'
import { useWorkspace } from '../workspace/WorkspaceProvider'

const preparationSteps = [
  { step: '1', title: 'Add recipients', description: 'Upload a CSV or XLSX file, map the phone column and review invalid or duplicate numbers.', href: workflowRoutes.recipients, action: 'Upload recipients' },
  { step: '2', title: 'Check consent & opt-outs', description: 'Review whether each number is allowed to continue and keep do-not-send records up to date.', href: workflowRoutes.consent, action: 'Review eligibility' },
  { step: '3', title: 'Write the message', description: 'Personalize the SMS, review estimated SMS units and save a draft for confirmation.', href: workflowRoutes.composer, action: 'Write message' },
] as const

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
      <section className="page-heading"><div><p className="eyebrow">Campaigns</p><h1>Campaigns</h1><p>Prepare recipients and a message, then review and confirm an immutable campaign snapshot before any sending workflow is enabled.</p></div></section>
      {error ? <div className="notice error-notice">{error}</div> : null}

      <section className="metric-grid dashboard-module-grid" aria-label="Campaign preparation">{preparationSteps.map((item) => <article className="metric-card" key={item.step}><span>Step {item.step}</span><h2>{item.title}</h2><p>{item.description}</p><Link className="primary-link" to={item.href}>{item.action}</Link></article>)}</section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Confirmed campaigns</p><h2>Immutable campaign snapshots</h2></div><span className="badge badge-muted">{campaigns.length}</span></div>
        {loading ? <LoadingState label="Loading campaigns…" /> : campaigns.length === 0 ? <EmptyState title="No confirmed campaigns yet">Save a message draft, then use Review &amp; confirm from the message screen.</EmptyState> : (
          <div className="table-wrap"><table className="data-table campaign-list-table"><thead><tr><th>Campaign</th><th>Recipients</th><th>Estimated SMS</th><th>Phone &amp; SIM</th><th>Confirmed</th><th /></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.campaignId}><td><strong>{campaign.title}</strong><small>{campaign.encodingSummary} · {campaign.minimumSegments}–{campaign.maximumSegments} segments</small></td><td>{campaign.recipientCount.toLocaleString()}</td><td>{campaign.estimatedSmsUnits.toLocaleString()}</td><td>{campaign.gatewayDeviceName}<small>{campaign.simCarrierName || 'SIM'} · SIM {campaign.simSlotIndex + 1}</small></td><td>{dateTime(campaign.confirmedAt)}</td><td><Link className="primary-link" to={`/campaigns/${campaign.campaignId}`}>Open</Link></td></tr>)}</tbody></table></div>
        )}
      </section>

      <section className="notice warning-notice">Confirmed campaigns are frozen for execution. Gateway preflight, short-lived authorization, and durable cloud queueing are available. SMS execution and scheduling remain disabled.</section>
    </div>
  )
}
