import { useEffect, useMemo, useState } from 'react'
import { ActionDialog } from '../components/ActionDialog'
import { PairingQr } from '../components/PairingQr'
import { ErrorState, LoadingState } from '../components/StateViews'
import { SyncFreshness } from '../components/SyncFreshness'
import { errorMessage } from '../lib/errors'
import {
  bindGatewaySim,
  clearGatewaySimBinding,
  createGatewayPairing,
  gatewayWorkspaceReadiness,
  revokeGatewayDevice,
  revokeGatewayPairing,
  type CreatedGatewayPairing,
  type GatewayDeviceSummary,
  type GatewayPairingSession,
  type GatewaySimSummary,
} from '../lib/gatewayDevices'
import { useGatewayLiveStatus } from '../lib/useGatewayLiveStatus'
import { formatPairingCode } from '../lib/pairingQr'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { usePwa } from '../pwa/PwaProvider'

function dateTime(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function relativeTime(value: string | null) {
  if (!value) return 'Never seen'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return dateTime(value)
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function deviceHardware(device: GatewayDeviceSummary) {
  const label = [device.manufacturer, device.model].filter(Boolean).join(' ')
  return label || device.displayName || 'Android phone'
}

function simLabel(sim: GatewaySimSummary) {
  const carrier = sim.carrierName || sim.displayName || 'Unknown carrier'
  return `${carrier} · SIM ${sim.slotIndex + 1}`
}

function selectedSimLabel(device: GatewayDeviceSummary) {
  if (!device.boundSimId) return 'No SIM selected'
  const carrier = device.boundCarrierName || 'Selected SIM'
  const slot = device.boundSlotIndex == null ? '' : ` · SIM ${device.boundSlotIndex + 1}`
  return `${carrier}${slot}`
}

function healthLabel(device: GatewayDeviceSummary) {
  switch (device.healthStatus) {
    case 'recent': return 'Recently seen'
    case 'stale': return 'Not recently seen'
    case 'offline': return 'Offline'
    case 'never_seen': return 'Waiting for phone'
    case 'revoked': return 'Revoked'
  }
}

function healthBadgeClass(device: GatewayDeviceSummary) {
  if (device.healthStatus === 'recent') return 'badge-success'
  if (device.healthStatus === 'stale' || device.healthStatus === 'offline' || device.healthStatus === 'never_seen') return 'badge-warning'
  return 'badge-muted'
}

function pairingStatusLabel(session: GatewayPairingSession) {
  switch (session.status) {
    case 'pending': return 'Waiting'
    case 'claimed': return 'Paired'
    case 'expired': return 'Expired'
    case 'revoked': return 'Revoked'
  }
}

type DeviceAction =
  | { kind: 'switch_sim'; device: GatewayDeviceSummary; sim: GatewaySimSummary }
  | { kind: 'unselect_sim'; device: GatewayDeviceSummary }
  | { kind: 'disconnect'; device: GatewayDeviceSummary }

export function DevicesPage() {
  const { workspace } = useWorkspace()
  return workspace ? <DeviceWorkspace key={workspace.id} workspace={workspace} /> : null
}

function DeviceWorkspace({ workspace }: { workspace: { id: string } }) {
  const { online } = usePwa()
  const [pairing, setPairing] = useState<CreatedGatewayPairing | null>(null)
  const [pairAnotherOpen, setPairAnotherOpen] = useState(false)
  const [deviceAction, setDeviceAction] = useState<DeviceAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { devices, sessions, loading, fetching, syncError, lastSuccessAt, nextRetryAt, refresh } = useGatewayLiveStatus(workspace.id, busy)
  const canManage = true
  const activeDevices = useMemo(() => devices.filter((device) => device.status === 'active'), [devices])
  const previousDevices = useMemo(() => devices.filter((device) => device.status === 'revoked'), [devices])
  const readiness = useMemo(() => gatewayWorkspaceReadiness(devices), [devices])
  const activeDevicesSorted = useMemo(() => [...activeDevices].sort((left, right) => {
    const score = (device: GatewayDeviceSummary) => (device.healthStatus === 'recent' ? 2 : 0) + (device.bindingStatus === 'ready' ? 1 : 0)
    return score(right) - score(left) || left.displayName.localeCompare(right.displayName)
  }), [activeDevices])
  const showPairingPanel = activeDevices.length === 0 || pairAnotherOpen || pairing !== null

  useEffect(() => {
    if (!pairing) return
    const session = sessions.find((item) => item.pairingId === pairing.pairingId)
    if (session && session.status !== 'pending') {
      setPairing(null)
      setPairAnotherOpen(false)
      setMessage(session.status === 'claimed' ? 'Phone paired. SIM details will appear after BulkText Gateway reports its inventory.' : `Pairing code ${pairingStatusLabel(session).toLowerCase()}. Generate a new code if needed.`)
    }
  }, [sessions, pairing])

  async function generatePairing() {
    if (!online || !workspace || !canManage) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const created = await createGatewayPairing(workspace.id)
      setPairing(created)
      setPairAnotherOpen(true)
      setMessage('Pairing code generated. It expires in 10 minutes and can be used once.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not generate a pairing code.'))
    } finally {
      setBusy(false)
    }
  }

  async function cancelPairing() {
    if (!online || !pairing) return
    setBusy(true)
    setError(null)
    try {
      await revokeGatewayPairing(pairing.pairingId)
      setPairing(null)
      setPairAnotherOpen(false)
      setMessage('Pairing code cancelled.')
    } catch (reason) {
      setError(errorMessage(reason, 'Could not cancel the pairing code.'))
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

  async function confirmDeviceAction() {
    if (!deviceAction || !online || !workspace || busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (deviceAction.kind === 'switch_sim') {
        const { device, sim } = deviceAction
        await bindGatewaySim(workspace.id, device.deviceId, sim.simId)
        setMessage(`${simLabel(sim)} is now selected for ${device.displayName}.`)
      } else if (deviceAction.kind === 'unselect_sim') {
        await clearGatewaySimBinding(workspace.id, deviceAction.device.deviceId)
        setMessage(`SIM selection removed for ${deviceAction.device.displayName}.`)
      } else {
        await revokeGatewayDevice(workspace.id, deviceAction.device.deviceId)
        setMessage(`${deviceAction.device.displayName} disconnected.`)
      }
      setDeviceAction(null)
    } catch (reason) {
      const fallback = deviceAction.kind === 'switch_sim'
        ? 'Could not select the SIM.'
        : deviceAction.kind === 'unselect_sim'
          ? 'Could not remove the SIM selection.'
          : 'Could not disconnect the phone.'
      setDeviceAction(null)
      setError(errorMessage(reason, fallback))
    } finally {
      setBusy(false)
    }
  }

  const statusCurrent = online && !syncError && lastSuccessAt !== null && Date.now() - lastSuccessAt < 60_000
  const readinessDevice = readiness.device
  const readinessSim = readinessDevice ? selectedSimLabel(readinessDevice) : null
  const readinessTitle = !statusCurrent ? 'Status unavailable' : readiness.kind === 'ready'
    ? 'Ready to send'
    : readiness.kind === 'no_phone'
      ? 'Phone not connected'
      : readiness.kind === 'select_sim'
        ? 'Choose a SIM'
        : readiness.kind === 'sim_missing'
          ? 'Selected SIM missing'
          : 'Phone needs attention'
  const readinessDescription = !statusCurrent ? 'Last known setup is shown below. Reconnect or refresh to check current readiness.' : readiness.kind === 'ready' && readinessDevice
    ? `${deviceHardware(readinessDevice)} · ${readinessSim}`
    : readiness.kind === 'no_phone'
      ? 'Pair an Android phone before using BulkText to send.'
      : readiness.kind === 'select_sim' && readinessDevice
        ? `${deviceHardware(readinessDevice)} is paired. Choose which SIM BulkText may use.`
        : readiness.kind === 'sim_missing' && readinessDevice
          ? `${readinessSim} is no longer present. Select a currently available SIM.`
          : readinessDevice
            ? `${deviceHardware(readinessDevice)} · ${readinessSim}`
            : 'Review your phone and SIM setup.'

  return (
    <div className="page-stack devices-page">
      <section className="page-heading devices-heading">
        <div>
          <p className="eyebrow">Sending setup</p>
          <h1>Phone &amp; SIM</h1>
          <p>Connect an Android phone and choose the SIM BulkText should use for sending.</p>
        </div>
      </section>

      {!online ? <div className="notice warning-notice"><strong>Offline.</strong> Pairing, SIM selection, disconnect and live refresh are disabled until you reconnect.</div> : null}
      {error ? <ErrorState title="Device operation failed">{error}</ErrorState> : null}
      {message ? <div className="notice success-notice" role="status">{message}</div> : null}

      <section className={`phone-readiness-card phone-readiness-${statusCurrent ? readiness.kind : 'phone_attention'}`} aria-live="polite">
        <div className="phone-readiness-main">
          <div className="phone-readiness-icon" aria-hidden="true">{statusCurrent && readiness.ready ? '✓' : readiness.kind === 'phone_attention' || readiness.kind === 'sim_missing' ? '!' : '•'}</div>
          <div>
            <p className="eyebrow">Current readiness</p>
            <h2>{loading ? 'Checking Phone & SIM…' : readinessTitle}</h2>
            <p>{loading ? 'Loading the latest phone and SIM state.' : readinessDescription}</p>
            {!loading && readinessDevice ? <p className="phone-readiness-meta"><strong>Gateway:</strong> {healthLabel(readinessDevice)} · <strong>Last seen:</strong> {relativeTime(readinessDevice.lastSeenAt)}</p> : null}
            {!loading && statusCurrent && readiness.ready && readiness.activeDeviceCount > 1 ? <p className="phone-readiness-meta">{readiness.readyDeviceCount} of {readiness.activeDeviceCount} active phones are ready.</p> : null}
          </div>
        </div>
        <div className="phone-readiness-refresh">
          {syncError ? <span className="readiness-sync-error" role="status">{syncError}</span> : <SyncFreshness lastSuccessAt={lastSuccessAt} nextRetryAt={nextRetryAt} />}
          <button className="text-button compact-refresh-button" type="button" disabled={!online || fetching || busy} onClick={() => void refresh()} aria-label="Refresh Phone & SIM status">↻ Refresh</button>
        </div>
      </section>

      {canManage && showPairingPanel ? (
        <section className={`panel pairing-control-panel ${activeDevices.length === 0 ? 'pairing-control-primary' : ''}`}>
          <div className="panel-heading">
            <div><p className="eyebrow">Pair phone</p><h2>{activeDevices.length === 0 ? 'Connect your Android phone' : 'Pair another phone'}</h2></div>
            {!pairing ? <div className="button-row pairing-heading-actions"><button className={activeDevices.length === 0 ? 'primary-button' : 'secondary-button'} type="button" disabled={!online || busy} onClick={() => void generatePairing()}>Generate pairing code</button>{activeDevices.length > 0 ? <button className="text-button" type="button" onClick={() => setPairAnotherOpen(false)}>Close</button> : null}</div> : null}
          </div>
          {!pairing ? <p className="muted-copy">Open BulkText Gateway on Android and scan a one-time pairing code.</p> : null}

          {pairing ? (
            <div className="pairing-layout pairing-layout-simplified">
              <div className="pairing-qr-card"><PairingQr code={pairing.pairingCode} /></div>
              <div className="pairing-details">
                <p className="eyebrow">Scan with BulkText Gateway</p>
                <h3>Pair your Android phone</h3>
                <div className="pairing-code" aria-label="Pairing code">{formatPairingCode(pairing.pairingCode)}</div>
                <p>Expires <strong>{dateTime(pairing.expiresAt)}</strong></p>
                <button className="primary-button" type="button" onClick={() => void copy(pairing.pairingCode, 'Pairing code')}>Copy code</button>
                <p className="pairing-security-note">For security, this code is shown only once.</p>
                <details className="compact-disclosure pairing-advanced-options">
                  <summary>More options</summary>
                  <div className="compact-disclosure-body button-row">
                    <button className="secondary-button compact-button" type="button" onClick={() => void copy(pairing.pairingUri, 'Pairing URI')}>Copy pairing URI</button>
                    <button className="danger-button compact-button" type="button" disabled={!online || busy} onClick={() => void cancelPairing()}>Cancel pairing</button>
                  </div>
                </details>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {canManage && activeDevices.length > 0 && !showPairingPanel ? (
        <div className="pair-another-row"><button className="text-button" type="button" onClick={() => setPairAnotherOpen(true)}>+ Pair another phone</button></div>
      ) : null}

      {loading && devices.length === 0 ? <LoadingState label="Loading phone & SIM…" /> : null}

      {activeDevicesSorted.length > 0 ? (
        <section className="panel active-phones-panel">
          <div className="panel-heading"><div><p className="eyebrow">Sending phones</p><h2>{activeDevicesSorted.length === 1 ? 'Active phone' : `Active phones · ${activeDevicesSorted.length}`}</h2></div></div>
          <div className="device-dashboard-grid">
            {activeDevicesSorted.map((device) => {
              const lowBattery = device.batteryPercent !== null && device.batteryPercent <= 20
              return (
                <article className="device-dashboard-card device-readiness-card" key={device.deviceId}>
                  <header className="device-card-header">
                    <div>
                      <p className="eyebrow">{deviceHardware(device)}</p>
                      <h3>{device.displayName}</h3>
                      <p className="device-primary-sim">{selectedSimLabel(device)}</p>
                      <small>Last seen {relativeTime(device.lastSeenAt)}</small>
                    </div>
                    <span className={`badge ${healthBadgeClass(device)}`}>{healthLabel(device)}</span>
                  </header>

                  {lowBattery ? <div className="notice warning-notice compact-notice"><strong>Low battery · {device.batteryPercent}%</strong> Keep the phone powered while BulkText Gateway is sending.</div> : null}
                  {device.bindingStatus === 'missing' ? <div className="notice warning-notice compact-notice"><strong>Selected SIM missing.</strong> BulkText will not fall back to another SIM. Choose a present SIM before sending.</div> : null}
                  {device.healthStatus !== 'recent' && device.bindingStatus === 'ready' ? <div className="notice warning-notice compact-notice"><strong>{healthLabel(device)}.</strong> Sending requires a fresh phone check-in before final authorization.</div> : null}

                  <div className="sim-section">
                    <div className="sim-section-heading"><strong>SIMs</strong><span>{device.sims.filter((sim) => sim.present).length} detected</span></div>
                    {device.sims.length === 0 ? (
                      <p className="muted-copy sim-empty">Waiting for this phone to report its SIMs.</p>
                    ) : (
                      <div className="sim-list">
                        {device.sims.map((sim) => {
                          const selected = device.boundSimId === sim.simId
                          return (
                            <div className={`sim-row ${selected ? 'sim-row-selected' : ''} ${!sim.present ? 'sim-row-missing' : ''}`} key={sim.simId}>
                              <div>
                                <strong>{simLabel(sim)}</strong>
                                {sim.isEmbedded ? <small>eSIM</small> : null}
                              </div>
                              <div className="sim-row-actions">
                                {selected ? <span className={`badge ${sim.present ? 'badge-success' : 'badge-warning'}`}>{sim.present ? 'Selected' : 'Missing'}</span> : null}
                                {!selected && sim.present && canManage ? <button className="secondary-button compact-button" type="button" disabled={!online || busy} onClick={() => setDeviceAction({ kind: 'switch_sim', device, sim })}>Use this SIM</button> : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <details className="compact-disclosure device-details-disclosure">
                    <summary>Device details</summary>
                    <dl className="device-detail-rows compact-disclosure-body">
                      <div><dt>Pairing</dt><dd>Paired</dd></div>
                      <div><dt>Gateway</dt><dd>{healthLabel(device)}</dd></div>
                      <div><dt>Last seen</dt><dd>{dateTime(device.lastSeenAt)}</dd></div>
                      <div><dt>Last synced</dt><dd>{dateTime(device.lastInventoryAt)}</dd></div>
                      <div><dt>Android</dt><dd>{device.androidRelease ?? '—'}{device.sdkInt ? ` · API ${device.sdkInt}` : ''}</dd></div>
                      <div><dt>Gateway app</dt><dd>{device.appVersion ?? '—'}{device.appVersionCode !== null ? ` (${device.appVersionCode})` : ''}</dd></div>
                      <div><dt>Battery</dt><dd>{device.batteryPercent === null ? '—' : `${device.batteryPercent}%`}</dd></div>
                      <div><dt>Credential</dt><dd>v{device.credentialVersion}</dd></div>
                      <div><dt>Device ID</dt><dd><code>…{device.deviceId.slice(-8)}</code></dd></div>
                      <div><dt>Paired</dt><dd>{dateTime(device.pairedAt)}</dd></div>
                    </dl>
                  </details>

                  <details className="compact-disclosure device-actions-disclosure">
                    <summary>Device actions</summary>
                    <div className="compact-disclosure-body button-row device-actions">
                      {device.boundSimId && canManage ? <button className="secondary-button compact-button" type="button" disabled={!online || busy} onClick={() => setDeviceAction({ kind: 'unselect_sim', device })}>Unselect SIM</button> : null}
                      {canManage ? <button className="danger-button compact-button" type="button" disabled={!online || busy} onClick={() => setDeviceAction({ kind: 'disconnect', device })}>Disconnect phone</button> : null}
                    </div>
                  </details>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {previousDevices.length > 0 ? (
        <details className="panel compact-disclosure previous-devices-disclosure">
          <summary><span><strong>Previous phones · {previousDevices.length}</strong><small>Revoked phones are kept for history and support.</small></span></summary>
          <div className="compact-disclosure-body previous-device-list">
            {previousDevices.map((device) => <div className="previous-device-row" key={device.deviceId}><div><strong>{device.displayName}</strong><small>{deviceHardware(device)} · Revoked {dateTime(device.revokedAt)}</small></div><span className="badge badge-muted">Revoked</span></div>)}
          </div>
        </details>
      ) : null}

      {canManage && sessions.length > 0 ? (
        <details className="panel compact-disclosure pairing-history-disclosure">
          <summary><span><strong>Pairing history</strong><small>{sessions.length} recent pairing session{sessions.length === 1 ? '' : 's'}</small></span></summary>
          <div className="compact-disclosure-body pairing-history-list">
            {sessions.slice(0, 10).map((session) => (
              <div className="pairing-history-row" key={session.pairingId}>
                <div><strong>{pairingStatusLabel(session)}</strong><small>Created {dateTime(session.createdAt)} · Expires {dateTime(session.expiresAt)}</small></div>
                <span className={`badge ${session.status === 'claimed' ? 'badge-success' : session.status === 'pending' ? 'badge-warning' : 'badge-muted'}`}>{pairingStatusLabel(session)}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <section className="phone-sim-safety-callout">
        <div><strong>SIM safety</strong><p>BulkText sends only through the SIM you select. If that SIM changes or is removed, sending is blocked until you choose again.</p><small>Selecting a SIM never sends messages.</small></div>
      </section>

      <ActionDialog
        open={deviceAction?.kind === 'switch_sim'}
        eyebrow="SIM selection"
        title="Change sending SIM?"
        description={deviceAction?.kind === 'switch_sim' ? `Current: ${selectedSimLabel(deviceAction.device)}. New: ${simLabel(deviceAction.sim)}.` : undefined}
        confirmLabel={deviceAction?.kind === 'switch_sim' ? `Use ${simLabel(deviceAction.sim)}` : 'Use selected SIM'}
        busyLabel="Changing SIM…"
        busy={busy}
        onCancel={() => setDeviceAction(null)}
        onConfirm={confirmDeviceAction}
      >
        <p className="muted-copy">New campaign setup can use this SIM after the change. Confirmed campaigns keep their locked phone/SIM snapshot, and sending them later still requires that exact SIM to match.</p>
      </ActionDialog>

      <ActionDialog
        open={deviceAction?.kind === 'unselect_sim'}
        eyebrow="SIM selection"
        title={deviceAction?.kind === 'unselect_sim' ? `Unselect ${selectedSimLabel(deviceAction.device)}?` : 'Unselect SIM?'}
        description="BulkText will block sending until a currently present SIM is selected again."
        confirmLabel="Unselect SIM"
        busyLabel="Unselecting…"
        busy={busy}
        tone="danger"
        onCancel={() => setDeviceAction(null)}
        onConfirm={confirmDeviceAction}
      />

      <ActionDialog
        open={deviceAction?.kind === 'disconnect'}
        eyebrow="Phone connection"
        title={deviceAction?.kind === 'disconnect' ? `Disconnect ${deviceAction.device.displayName}?` : 'Disconnect phone?'}
        description="BulkText will stop using this phone for future sends. You can pair it again later."
        confirmLabel="Disconnect phone"
        busyLabel="Disconnecting…"
        busy={busy}
        tone="danger"
        onCancel={() => setDeviceAction(null)}
        onConfirm={confirmDeviceAction}
      />
    </div>
  )
}
