import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { listCampaignConfirmations, type ConfirmedCampaignSummary } from '../lib/campaignConfirmationApi'
import { errorMessage } from '../lib/errors'
import { gatewayWorkspaceReadiness, listGatewayDevices, type GatewayDeviceSummary, type GatewayHealthStatus } from '../lib/gatewayDevices'
import { listContactImports, type ContactImportSummary } from '../lib/importsApi'
import { listMessageComposerDrafts, listMessageComposerSources, type MessageComposerDraft, type MessageComposerSource } from '../lib/messageComposerApi'
import { workflowRoutes } from '../lib/productNavigation'
import { usePwa } from '../pwa/PwaProvider'
import { useWorkspace } from '../workspace/WorkspaceProvider'

interface DashboardData {
  devices: GatewayDeviceSummary[]
  imports: ContactImportSummary[]
  sources: MessageComposerSource[]
  drafts: MessageComposerDraft[]
  campaigns: ConfirmedCampaignSummary[]
}

type DashboardDataKey = keyof DashboardData
type DashboardLoadErrors = Partial<Record<DashboardDataKey, string>>

const emptyData: DashboardData = { devices: [], imports: [], sources: [], drafts: [], campaigns: [] }

function phoneName(device: GatewayDeviceSummary | null | undefined) {
  if (!device) return 'Not paired'
  return [device.manufacturer, device.model].filter(Boolean).join(' ') || device.displayName
}

function gatewayHealthLabel(status: GatewayHealthStatus | undefined) {
  switch (status) {
    case 'recent': return 'Recently seen'
    case 'stale': return 'Stale'
    case 'offline': return 'Offline'
    case 'never_seen': return 'Not yet seen'
    case 'revoked': return 'Revoked'
    default: return 'Not paired'
  }
}

function gatewayHealthBadge(status: GatewayHealthStatus | undefined, bindingStatus: GatewayDeviceSummary['bindingStatus'] | undefined) {
  if (!status) return 'badge-warning'
  if (bindingStatus !== 'ready' || status !== 'recent') return 'badge-warning'
  return 'badge-success'
}

function campaignDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function DashboardPage() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const { online } = usePwa()
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== "hidden") setRefreshTick((value) => value + 1) }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener("online", refresh)
    window.addEventListener("focus", refresh)
    return () => { window.clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh) }
  }, [])
  const displayName = String(user?.user_metadata?.display_name ?? '').trim()
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState<DashboardLoadErrors>({})

  useEffect(() => {
    if (!workspace || !online) return
    let cancelled = false
    setLoading(true)
    setLoadErrors({})

    void Promise.allSettled([
      listGatewayDevices(workspace.id),
      listContactImports(workspace.id),
      listMessageComposerSources(workspace.id),
      listMessageComposerDrafts(workspace.id),
      listCampaignConfirmations(workspace.id),
    ])
      .then(([devicesResult, importsResult, sourcesResult, draftsResult, campaignsResult]) => {
        if (cancelled) return
        const nextErrors: DashboardLoadErrors = {}
        if (devicesResult.status === 'rejected') nextErrors.devices = errorMessage(devicesResult.reason, 'Could not load Phone & SIM.')
        if (importsResult.status === 'rejected') nextErrors.imports = errorMessage(importsResult.reason, 'Could not load recipient imports.')
        if (sourcesResult.status === 'rejected') nextErrors.sources = errorMessage(sourcesResult.reason, 'Could not load recipient preparation.')
        if (draftsResult.status === 'rejected') nextErrors.drafts = errorMessage(draftsResult.reason, 'Could not load message drafts.')
        if (campaignsResult.status === 'rejected') nextErrors.campaigns = errorMessage(campaignsResult.reason, 'Could not load recent campaigns.')
        setData({
          devices: devicesResult.status === 'fulfilled' ? devicesResult.value : [],
          imports: importsResult.status === 'fulfilled' ? importsResult.value : [],
          sources: sourcesResult.status === 'fulfilled' ? sourcesResult.value : [],
          drafts: draftsResult.status === 'fulfilled' ? draftsResult.value : [],
          campaigns: campaignsResult.status === 'fulfilled' ? campaignsResult.value : [],
        })
        setLoadErrors(nextErrors)
        setLastCheckedAt(Date.now())
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [workspace?.id, refreshTick, online])

  const gatewayReadiness = useMemo(() => gatewayWorkspaceReadiness(data.devices), [data.devices])
  const activeDevice = gatewayReadiness.device
  const selectedSource = data.sources[0]
  const recentCampaigns = data.campaigns.slice(0, 3)
  const selectedSim = activeDevice?.bindingStatus === 'ready'
    ? activeDevice.boundCarrierName || `SIM ${(activeDevice.boundSlotIndex ?? 0) + 1}`
    : activeDevice?.bindingStatus === 'missing'
      ? 'Selected SIM missing'
      : 'Not selected'

  const devicesUnavailable = Boolean(loadErrors.devices)
  const sourcesUnavailable = Boolean(loadErrors.sources)
  const draftsUnavailable = Boolean(loadErrors.drafts)
  const campaignsUnavailable = Boolean(loadErrors.campaigns)
  const statusCurrent = online && !loading && lastCheckedAt !== null && Date.now() - lastCheckedAt < 60_000
  const phoneReady = statusCurrent && !devicesUnavailable && gatewayReadiness.ready
  const recipientsReady = Boolean(selectedSource && selectedSource.eligibleRows > 0)
  const messageReady = data.drafts.length > 0
  const issueLabels = Object.keys(loadErrors).map((key) => ({
    devices: 'Phone & SIM', imports: 'recipient imports', sources: 'recipient preparation', drafts: 'message drafts', campaigns: 'recent campaigns',
  }[key as DashboardDataKey]))

  const setupStatus = !online ? 'Offline — last known setup' : !statusCurrent ? 'Checking setup' : devicesUnavailable
    ? 'Unavailable'
    : gatewayReadiness.kind === 'no_phone'
      ? 'Pair phone'
      : gatewayReadiness.kind === 'sim_missing'
        ? 'SIM missing'
        : gatewayReadiness.kind === 'select_sim'
          ? 'Select SIM'
          : gatewayReadiness.kind === 'ready'
            ? 'Setup ready'
            : activeDevice
              ? gatewayHealthLabel(activeDevice.healthStatus)
              : 'Needs attention'

  return (
    <div className="page-stack dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow dashboard-heading-eyebrow">My BulkText</p>
          <h1>{displayName ? `Welcome, ${displayName}` : 'Welcome'}</h1>
          <p>Send campaigns through your selected Android phone and SIM.</p>
        </div>
        <Link className="primary-button desktop-heading-action" to="/campaigns/new">+ New campaign</Link>
      </section>

      {issueLabels.length > 0 ? (
        <section role="status" className="notice warning-notice dashboard-partial-notice">
          Some dashboard information could not be refreshed: {issueLabels.join(', ')}. Available sections remain usable.
        </section>
      ) : null}

      <section className="panel dashboard-sending-setup" aria-labelledby="dashboard-setup-title">
        <div className="panel-heading dashboard-setup-heading">
          <div>
            <p className="eyebrow">Sending setup</p>
            <h2 id="dashboard-setup-title">Your active route</h2>
          </div>
          <span className={`badge ${phoneReady ? 'badge-success' : 'badge-warning'}`}>{loading ? 'Checking…' : setupStatus}</span>
        </div>

        <dl className="dashboard-setup-strip">
          <div>
            <dt>Gateway</dt>
            <dd>
              {loading ? 'Checking…' : devicesUnavailable ? 'Unavailable' : gatewayHealthLabel(activeDevice?.healthStatus)}
              {!loading && !devicesUnavailable && activeDevice ? <span className={`dashboard-health-dot ${gatewayHealthBadge(activeDevice.healthStatus, activeDevice.bindingStatus)}`} aria-hidden="true" /> : null}
            </dd>
          </div>
          <div><dt>Phone</dt><dd>{loading ? 'Checking…' : devicesUnavailable ? 'Unavailable' : phoneName(activeDevice)}</dd></div>
          <div><dt>SIM</dt><dd>{loading ? 'Checking…' : devicesUnavailable ? 'Unavailable' : selectedSim}</dd></div>
          <div><dt>Recipients</dt><dd>{loading ? 'Checking…' : sourcesUnavailable ? 'Unavailable' : selectedSource ? `${selectedSource.eligibleRows} prepared` : 'None prepared'}</dd></div>
        </dl>

        <div className="dashboard-setup-actions">
          <p>{loading ? 'Checking your gateway and preparation state…' : phoneReady ? 'Phone and SIM were recently checked. A final safety check runs before sending.' : 'Review Phone & SIM before relying on this gateway for sending.'}</p>
          <Link className="card-action-link" to="/devices">Review setup →</Link>
        </div>
      </section>

      <section className="dashboard-utility-grid" aria-label="Campaign preparation">
        <article className="metric-card dashboard-utility-card">
          <div>
            <span className={`dashboard-utility-state ${recipientsReady ? 'is-ready' : ''}`}>{loading ? 'Checking…' : sourcesUnavailable ? 'Unavailable' : recipientsReady ? `${selectedSource.eligibleRows} prepared` : data.imports.length ? 'Needs review' : 'Not started'}</span>
            <h2>Recipients</h2>
            <p>{loading ? 'Checking recipient preparation…' : sourcesUnavailable ? 'Recipient preparation could not be refreshed.' : recipientsReady ? `${selectedSource.sourceFilename} is ready for campaign use.` : data.imports.length ? 'Your latest import still needs preparation.' : 'Upload a recipient list when you create a campaign.'}</p>
          </div>
          <Link className="card-action-link" to={workflowRoutes.recipients}>{data.imports.length ? 'Review recipients →' : 'Open imports →'}</Link>
        </article>

        <article className="metric-card dashboard-utility-card">
          <div>
            <span className={`dashboard-utility-state ${messageReady ? 'is-ready' : ''}`}>{loading ? 'Checking…' : draftsUnavailable ? 'Unavailable' : messageReady ? `${data.drafts.length} saved` : 'No saved draft'}</span>
            <h2>Message drafts</h2>
            <p>{loading ? 'Checking message drafts…' : draftsUnavailable ? 'Saved drafts could not be refreshed.' : messageReady ? `${data.drafts.length} saved message draft${data.drafts.length === 1 ? '' : 's'} available.` : 'Campaign creation can write the message inline; drafts remain available as a reusable tool.'}</p>
          </div>
          <Link className="card-action-link" to={workflowRoutes.composer}>Open drafts →</Link>
        </article>
      </section>

      <section className="panel dashboard-recent-panel" aria-labelledby="dashboard-recent-title">
        <div className="panel-heading">
          <div><p className="eyebrow">Activity</p><h2 id="dashboard-recent-title">Recent campaigns</h2></div>
          <Link className="card-action-link" to="/campaigns">View all campaigns →</Link>
        </div>

        {loading ? <p className="dashboard-recent-state">Loading recent campaigns…</p> : campaignsUnavailable ? (
          <p className="dashboard-recent-state">Recent campaign history could not be refreshed. Your sending setup and preparation tools are still available.</p>
        ) : recentCampaigns.length === 0 ? (
          <div className="dashboard-recent-empty">
            <p>No confirmed campaigns yet.</p>
            <span>Your first confirmed campaign will appear here.</span>
          </div>
        ) : (
          <div className="dashboard-recent-list">
            {recentCampaigns.map((campaign) => (
              <article className="dashboard-recent-row" key={campaign.campaignId}>
                <div className="dashboard-recent-main">
                  <h3>{campaign.title}</h3>
                  <p>{campaignDate(campaign.confirmedAt)} · {campaign.gatewayDeviceName} · {campaign.simCarrierName || `SIM ${campaign.simSlotIndex + 1}`}</p>
                </div>
                <div className="dashboard-recent-count"><strong>{campaign.recipientCount}</strong><span>recipient{campaign.recipientCount === 1 ? '' : 's'}</span></div>
                <Link className="dashboard-recent-link" to={`/campaigns/${campaign.campaignId}`} aria-label={`Open ${campaign.title}`}>Open →</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
