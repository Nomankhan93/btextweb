import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/errors'
import { listGatewayDevices, type GatewayDeviceSummary } from '../lib/gatewayDevices'
import { listContactImports, type ContactImportSummary } from '../lib/importsApi'
import { listMessageComposerDrafts, listMessageComposerSources, type MessageComposerDraft, type MessageComposerSource } from '../lib/messageComposerApi'
import { workflowRoutes } from '../lib/productNavigation'
import { useWorkspace } from '../workspace/WorkspaceProvider'

interface DashboardData {
  devices: GatewayDeviceSummary[]
  imports: ContactImportSummary[]
  sources: MessageComposerSource[]
  drafts: MessageComposerDraft[]
}

const emptyData: DashboardData = { devices: [], imports: [], sources: [], drafts: [] }

function phoneName(device: GatewayDeviceSummary | undefined) {
  if (!device) return 'Not paired'
  return [device.manufacturer, device.model].filter(Boolean).join(' ') || device.displayName
}

export function DashboardPage() {
  const { user } = useAuth()
  const { workspace } = useWorkspace()
  const displayName = String(user?.user_metadata?.display_name ?? '').trim()
  const [data, setData] = useState<DashboardData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void Promise.all([
      listGatewayDevices(workspace.id),
      listContactImports(workspace.id),
      listMessageComposerSources(workspace.id),
      listMessageComposerDrafts(workspace.id),
    ])
      .then(([devices, imports, sources, drafts]) => {
        if (!cancelled) setData({ devices, imports, sources, drafts })
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(errorMessage(reason, 'Could not load your current setup.'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace])

  const activeDevice = useMemo(() => data.devices.find((device) => device.status === 'active'), [data.devices])
  const selectedSource = data.sources[0]
  const selectedSim = activeDevice?.bindingStatus === 'ready'
    ? activeDevice.boundCarrierName || `SIM ${(activeDevice.boundSlotIndex ?? 0) + 1}`
    : activeDevice?.bindingStatus === 'missing'
      ? 'Selected SIM missing'
      : 'Not selected'

  const phoneReady = Boolean(activeDevice && activeDevice.bindingStatus === 'ready')
  const recipientsReady = Boolean(selectedSource && selectedSource.eligibleRows > 0)
  const messageReady = data.drafts.length > 0

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">My BulkText</p>
          <h1>{displayName ? `Welcome, ${displayName}` : 'Welcome'}</h1>
          <p>Prepare recipients and a personalized SMS campaign using your own Android phone and the SIM you explicitly select.</p>
        </div>
      </section>

      {loadError ? <section className="notice warning-notice">{loadError}</section> : null}

      <section className="metric-grid dashboard-module-grid" aria-label="Setup status">
        <article className="metric-card">
          <span>{loading ? 'Checking…' : phoneReady ? 'Ready' : activeDevice ? 'Needs attention' : 'Not connected'}</span>
          <h2>{activeDevice ? 'Phone & SIM' : 'Pair my phone'}</h2>
          <p>{loading ? 'Checking your Android phone…' : activeDevice ? `${phoneName(activeDevice)} · ${selectedSim}` : 'Connect your Android phone and choose the SIM BulkText may use.'}</p>
          <Link className="primary-link" to="/devices">{activeDevice ? 'Review phone' : 'Pair phone'}</Link>
        </article>

        <article className="metric-card">
          <span>{loading ? 'Checking…' : recipientsReady ? 'Ready' : data.imports.length ? 'Needs review' : 'Not started'}</span>
          <h2>Recipients</h2>
          <p>{loading ? 'Checking recipient preparation…' : recipientsReady ? `${selectedSource.eligibleRows} recipient${selectedSource.eligibleRows === 1 ? '' : 's'} ready for a message.` : data.imports.length ? 'An uploaded file still needs validation and eligibility review.' : 'Upload a CSV or XLSX file to prepare recipients.'}</p>
          <Link className="primary-link" to={workflowRoutes.recipients}>{data.imports.length ? 'Review uploads' : 'Upload recipients'}</Link>
        </article>

        <article className="metric-card">
          <span>{loading ? 'Checking…' : messageReady ? 'Draft ready' : recipientsReady ? 'Ready to write' : 'Waiting for recipients'}</span>
          <h2>Message</h2>
          <p>{loading ? 'Checking message drafts…' : messageReady ? `${data.drafts.length} saved message draft${data.drafts.length === 1 ? '' : 's'}.` : recipientsReady ? 'Write and personalize a message, then review estimated SMS usage.' : 'Finish recipient preparation before writing a message.'}</p>
          {recipientsReady ? <Link className="primary-link" to={workflowRoutes.composer}>{messageReady ? 'Open drafts' : 'Write message'}</Link> : <span className="badge badge-muted">Recipients required</span>}
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Current setup</p><h2>Your sending setup</h2></div></div>
        <dl className="definition-grid">
          <div><dt>Phone</dt><dd>{phoneName(activeDevice)}</dd></div>
          <div><dt>Selected SIM</dt><dd>{selectedSim}</dd></div>
          <div><dt>Recipients</dt><dd>{selectedSource ? `${selectedSource.eligibleRows} ready` : 'None ready yet'}</dd></div>
        </dl>
      </section>
    </div>
  )
}
