import { useCallback, useEffect, useMemo, useState } from 'react'
import { PairingQr } from '../components/PairingQr'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import {
  bindGatewaySim,
  clearGatewaySimBinding,
  createGatewayPairing,
  gatewayBindingLabel,
  gatewayHealthLabel,
  listGatewayDevices,
  listGatewayPairingSessions,
  revokeGatewayDevice,
  revokeGatewayPairing,
  type CreatedGatewayPairing,
  type GatewayDeviceSummary,
  type GatewayPairingSession,
  type GatewaySimSummary,
} from '../lib/gatewayDevices'
import { formatPairingCode } from '../lib/pairingQr'
import { useWorkspace } from '../workspace/WorkspaceProvider'

function dateTime(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function deviceHardware(device: GatewayDeviceSummary) {
  const label = [device.manufacturer, device.model].filter(Boolean).join(' ')
  return label || 'Android gateway'
}

function simLabel(sim: GatewaySimSummary) {
  const carrier = sim.carrierName || sim.displayName || 'Unknown carrier'
  return `${carrier} · SIM ${sim.slotIndex + 1}`
}

export function DevicesPage() {
  const { workspace } = useWorkspace()
  const [devices, setDevices] = useState<GatewayDeviceSummary[]>([])
  const [sessions, setSessions] = useState<GatewayPairingSession[]>([])
  const [pairing, setPairing] = useState<CreatedGatewayPairing | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canManage = true
  const activeDevices = useMemo(() => devices.filter((device) => device.status === 'active'), [devices])
  const readyDevices = useMemo(() => activeDevices.filter((device) => device.bindingStatus === 'ready'), [activeDevices])
  const detectedSims = useMemo(() => activeDevices.reduce((total, device) => total + device.sims.filter((sim) => sim.present).length, 0), [activeDevices])

  const refresh = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    setError(null)
    try {
      const nextDevices = await listGatewayDevices(workspace.id)
      setDevices(nextDevices)
      setSessions(await listGatewayPairingSessions(workspace.id))
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load gateway devices.'))
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    setPairing(null)
    setMessage(null)
    void refresh()
  }, [refresh])

  async function generatePairing() {
    if (!workspace || !canManage) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createGatewayPairing(workspace.id)
      setPairing(created)
      setMessage('Pairing code generated. It expires in 10 minutes and can be used once.')
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not generate a gateway pairing code.'))
    } finally {
      setBusy(false)
    }
  }

  async function cancelPairing() {
    if (!pairing) return
    setBusy(true)
    setError(null)
    try {
      await revokeGatewayPairing(pairing.pairingId)
      setPairing(null)
      setMessage('Pairing code revoked.')
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not revoke the pairing code.'))
    } finally {
      setBusy(false)
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied.`)
    } catch {
      setError(`Could not copy ${label.toLowerCase()}. Select and copy it manually.`)
    }
  }

  async function bindSim(device: GatewayDeviceSummary, sim: GatewaySimSummary) {
    if (!workspace || !canManage || !sim.present) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await bindGatewaySim(workspace.id, device.deviceId, sim.simId)
      setMessage(`${simLabel(sim)} is now the selected SIM for ${device.displayName}.`)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not bind the selected SIM.'))
    } finally {
      setBusy(false)
    }
  }

  async function unbindSim(device: GatewayDeviceSummary) {
    if (!workspace || !canManage || !device.boundSimId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await clearGatewaySimBinding(workspace.id, device.deviceId)
      setMessage(`SIM selection cleared for ${device.displayName}.`)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not clear the SIM binding.'))
    } finally {
      setBusy(false)
    }
  }

  async function revokeDevice(device: GatewayDeviceSummary) {
    if (!workspace || !canManage) return
    const confirmed = window.confirm(`Revoke ${device.displayName}? The gateway credential will stop working immediately.`)
    if (!confirmed) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await revokeGatewayDevice(workspace.id, device.deviceId)
      setMessage(`${device.displayName} revoked.`)
      await refresh()
    } catch (reason) {
      setError(errorMessage(reason, 'Could not revoke the gateway device.'))
    } finally {
      setBusy(false)
    }
  }

  if (!workspace) return null

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">My Android phone</p>
          <h1>Phone &amp; SIM</h1>
          <p>See paired Android gateway health and explicitly bind the SIM subscription BulkText may use. A missing or replaced SIM never silently falls back to another subscription.</p>
        </div>
        <button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void refresh()}>Refresh</button>
      </section>

      {error ? <ErrorState title="Device operation failed">{error}</ErrorState> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="metric-grid compact-grid">
        <article className="metric-card"><span>Gateways</span><h2>{activeDevices.length} active</h2><p>Paired gateway credentials remain isolated to your account.</p></article>
        <article className="metric-card"><span>SIM inventory</span><h2>{detectedSims} detected</h2><p>Inventory is reported by the authenticated Android gateway.</p></article>
        <article className="metric-card"><span>Ready</span><h2>{readyDevices.length} bound</h2><p>A ready gateway has an explicit, currently-present SIM selection.</p></article>
      </section>

      {canManage ? (
        <section className="panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Secure pairing</p><h2>Add Android gateway</h2></div>
            {!pairing ? <button className="primary-button" type="button" disabled={busy} onClick={() => void generatePairing()}>Generate pairing code</button> : null}
          </div>
          <p className="muted-copy">Pairing is one-use and device-scoped. After pairing, the Android app reports phone and SIM inventory before you explicitly select the SIM BulkText may use.</p>

          {pairing ? (
            <div className="pairing-layout">
              <div className="pairing-qr-card"><PairingQr code={pairing.pairingCode} /></div>
              <div className="pairing-details">
                <p className="eyebrow">One-use code</p>
                <div className="pairing-code" aria-label="Pairing code">{formatPairingCode(pairing.pairingCode)}</div>
                <p>Expires <strong>{dateTime(pairing.expiresAt)}</strong></p>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => void copy(pairing.pairingCode, 'Pairing code')}>Copy code</button>
                  <button className="secondary-button" type="button" onClick={() => void copy(pairing.pairingUri, 'Pairing URI')}>Copy pairing URI</button>
                  <button className="danger-button" type="button" disabled={busy} onClick={() => void cancelPairing()}>Revoke code</button>
                </div>
                <div className="notice warning-notice">The raw code is shown only in this browser state. Refreshing the page does not reveal it again.</div>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="notice warning-notice"></div>
      )}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Device dashboard</p><h2>My paired phone</h2></div></div>
        {loading ? <LoadingState label="Loading gateway dashboard…" /> : devices.length === 0 ? (
          <EmptyState title="No gateway devices yet">Generate a pairing code and connect your Android phone.</EmptyState>
        ) : (
          <div className="device-dashboard-grid">
            {devices.map((device) => (
              <article className="device-dashboard-card" key={device.deviceId}>
                <header className="device-card-header">
                  <div>
                    <p className="eyebrow">{deviceHardware(device)}</p>
                    <h3>{device.displayName}</h3>
                    <small>{device.platform} · {device.deviceId.slice(0, 8)}</small>
                  </div>
                  <span className={`badge ${device.healthStatus === 'recent' ? 'badge-success' : device.healthStatus === 'stale' ? 'badge-warning' : 'badge-muted'}`}>{gatewayHealthLabel(device.healthStatus)}</span>
                </header>

                <dl className="device-facts">
                  <div><dt>Android</dt><dd>{device.androidRelease ?? '—'}{device.sdkInt ? ` · API ${device.sdkInt}` : ''}</dd></div>
                  <div><dt>Gateway app</dt><dd>{device.appVersion ?? '—'}{device.appVersionCode !== null ? ` (${device.appVersionCode})` : ''}</dd></div>
                  <div><dt>Battery</dt><dd>{device.batteryPercent === null ? '—' : `${device.batteryPercent}%`}</dd></div>
                  <div><dt>Last inventory</dt><dd>{dateTime(device.lastInventoryAt)}</dd></div>
                  <div><dt>Credential</dt><dd>v{device.credentialVersion}</dd></div>
                  <div><dt>SIM binding</dt><dd className={device.bindingStatus === 'missing' ? 'danger-copy' : ''}>{gatewayBindingLabel(device)}</dd></div>
                </dl>

                {device.bindingStatus === 'missing' ? <div className="notice warning-notice compact-notice">The selected SIM is no longer present. BulkText will not fall back to another SIM; select a present SIM before sending is enabled.</div> : null}

                <div className="sim-section">
                  <div className="sim-section-heading"><strong>Detected SIMs</strong><span>{device.sims.filter((sim) => sim.present).length} present</span></div>
                  {device.sims.length === 0 ? (
                    <p className="muted-copy sim-empty">Waiting for the Android gateway to report SIM inventory.</p>
                  ) : (
                    <div className="sim-list">
                      {device.sims.map((sim) => {
                        const selected = device.boundSimId === sim.simId
                        return (
                          <div className={`sim-row ${selected ? 'sim-row-selected' : ''} ${!sim.present ? 'sim-row-missing' : ''}`} key={sim.simId}>
                            <div>
                              <strong>{simLabel(sim)}</strong>
                              <small>subscription {sim.subscriptionId}{sim.isEmbedded ? ' · eSIM' : ''}{sim.countryIso ? ` · ${sim.countryIso.toUpperCase()}` : ''}</small>
                            </div>
                            <div className="sim-row-actions">
                              {selected ? <span className={`badge ${sim.present ? 'badge-success' : 'badge-warning'}`}>{sim.present ? 'Bound' : 'Missing'}</span> : null}
                              {!selected && sim.present && device.status === 'active' && canManage ? <button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void bindSim(device, sim)}>Use this SIM</button> : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <footer className="device-card-footer">
                  <span>Paired {dateTime(device.pairedAt)} · Last seen {dateTime(device.lastSeenAt)}</span>
                  <div className="button-row device-actions">
                    {device.boundSimId && canManage ? <button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void unbindSim(device)}>Clear SIM</button> : null}
                    {device.status === 'active' && canManage ? <button className="danger-button" type="button" disabled={busy} onClick={() => void revokeDevice(device)}>Revoke gateway</button> : null}
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Security ledger</p><h2>Recent pairing sessions</h2></div></div>
          {sessions.length === 0 ? <p className="muted-copy">No pairing sessions have been generated for your account.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Created</th><th>Status</th><th>Expires</th><th>Device</th></tr></thead>
                <tbody>{sessions.map((session) => (
                  <tr key={session.pairingId}>
                    <td>{dateTime(session.createdAt)}</td>
                    <td><span className={`badge ${session.status === 'claimed' ? 'badge-success' : session.status === 'pending' ? 'badge-warning' : 'badge-muted'}`}>{session.status}</span></td>
                    <td>{dateTime(session.expiresAt)}</td>
                    <td>{session.claimedDeviceId ? session.claimedDeviceId.slice(0, 8) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Sending invariant</p><h2>No silent SIM fallback</h2></div></div>
        <div className="definition-grid">
          <div><dt>Gateway identity</dt><dd>Device-scoped credential</dd></div>
          <div><dt>SIM identity</dt><dd>Explicit subscription binding</dd></div>
          <div><dt>Missing selected SIM</dt><dd>Blocked until re-bound</dd></div>
        </div>
        <p className="muted-copy device-security-copy">Selecting a SIM does not send messages by itself. Campaign sending will require an active gateway and a ready SIM binding.</p>
      </section>
    </div>
  )
}
