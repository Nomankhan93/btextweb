import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Phone & SIM Readiness Control Center source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const page = await readFile(new URL('../src/pages/DevicesPage.tsx', import.meta.url), 'utf8')
const gateway = await readFile(new URL('../src/lib/gatewayDevices.ts', import.meta.url), 'utf8')
const dashboard = await readFile(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const tests = await readFile(new URL('../src/test/phoneSimReadiness02011.test.tsx', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const preflight = await readFile(new URL('../scripts/preflight.mjs', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')

check(gateway.includes("export type GatewayReadinessKind = 'ready' | 'select_sim' | 'sim_missing' | 'phone_attention' | 'no_phone'"), 'readiness state vocabulary must be explicit')
check(gateway.includes('gatewayDeviceReadyForSending'), 'per-device readiness helper must exist')
check(gateway.includes("device.healthStatus === 'recent'"), 'ready route must require a fresh gateway')
check(gateway.includes("device.bindingStatus === 'ready'"), 'ready route must require a valid selected SIM')
check(gateway.includes('Boolean(device.boundSimId)'), 'ready route must require an explicit SIM id')
check(gateway.includes('gatewayWorkspaceReadiness'), 'workspace readiness must have one shared derivation helper')
check(gateway.includes("kind: 'phone_attention'"), 'stale/offline phones must resolve to attention instead of ready')
check(dashboard.includes('gatewayWorkspaceReadiness(data.devices)'), 'Home dashboard must reuse the shared Phone & SIM readiness derivation')

check(page.includes('Current readiness') && page.includes('Ready to send') && page.includes('Phone needs attention'), 'page must expose truthful derived readiness states')
check(page.includes("case 'stale': return 'Not recently seen'"), 'stale gateway wording must be user-facing')
check(page.includes('<strong>Gateway:</strong>') && page.includes('<strong>Last seen:</strong>'), 'paired relation and live freshness must not be conflated')
check(page.includes('Refresh Phone & SIM status'), 'manual refresh must remain available as a compact fallback')
check(!page.includes('className="metric-grid compact-grid"'), 'retired three-card readiness summary must not return')

check(page.includes("activeDevices.length === 0 ? 'Connect your Android phone' : 'Pair another phone'"), 'pairing panel must be state-dependent')
check(page.includes('showPairingPanel'), 'connected state must be able to demote pairing')
check(page.includes('Scan with BulkText Gateway'), 'pairing QR must have user-facing guidance')
check(page.includes('For security, this code is shown only once.'), 'one-time code warning must be concise')
check(page.includes('More options') && page.includes('Copy pairing URI'), 'technical pairing URI must be collapsed under advanced options')
check(page.includes('Cancel pairing'), 'pairing cancellation must remain available')

check(page.includes('Active phone') && page.includes('Previous phones'), 'active and revoked phones must have separate hierarchy')
check(page.includes("devices.filter((device) => device.status === 'active')"), 'active-phone surface must exclude revoked devices')
check(page.includes("devices.filter((device) => device.status === 'revoked')"), 'revoked devices must remain available as history')
check(page.includes('Device details'), 'technical metadata must be collapsed under Device details')
check(page.includes('<dt>Credential</dt>') && page.includes('<dt>Device ID</dt>'), 'support metadata must remain available under details')
check(page.includes('Low battery ·'), 'battery must surface conditionally when attention is useful')
check(!page.includes('Last inventory</dt>'), 'retired developer-facing Last inventory label must not return')
check(page.includes('<dt>Last synced</dt>'), 'inventory freshness must use user-facing wording')

check(page.includes("sim.present ? 'Selected' : 'Missing'"), 'Bound wording must be replaced with Selected')
check(!page.includes('>Clear SIM<'), 'Clear SIM wording must be removed')
check(page.includes('Unselect SIM'), 'SIM deselection must use clear user-facing wording')
check(!page.includes('subscription {sim.subscriptionId}'), 'subscription id must not remain in the normal SIM surface')
check(page.includes("setDeviceAction({ kind: 'switch_sim', device, sim })"), 'SIM switch must enter an explicit confirmation flow')
check(page.includes('Change sending SIM?'), 'SIM switch must use a branded confirmation dialog')
check(page.includes('locked phone/SIM snapshot') && page.includes('exact SIM to match'), 'SIM switch copy must preserve confirmed-campaign exact-SIM semantics')
check(page.includes("setDeviceAction({ kind: 'disconnect', device })"), 'disconnect must enter an explicit confirmation flow')
check(!page.includes('window.confirm'), 'Phone & SIM actions must not use native browser confirmation')

check(page.includes('Pairing history') && page.includes('pairingStatusLabel'), 'pairing history must remain available in collapsed user-facing form')
check(page.includes("case 'claimed': return 'Paired'"), 'claimed backend wording must be translated to Paired')
check(!page.includes('Recent pairing codes'), 'large always-visible pairing history section must be removed')
check(page.includes('SIM safety') && page.includes('Selecting a SIM never sends messages.'), 'SIM safety must be one concise callout')

check(styles.includes('/* 0.20.11 — Phone & SIM Readiness Control Center */'), 'release-specific visual contract marker must exist')
check(styles.includes('.phone-readiness-card') && styles.includes('.phone-readiness-ready'), 'readiness card styling must exist')
check(styles.includes('.compact-disclosure') && styles.includes('.device-detail-rows'), 'collapsed details/history styling must exist')
check(styles.includes('.phone-sim-safety-callout'), 'compact SIM safety callout styling must exist')
check(styles.includes('@media (max-width: 560px)') && styles.includes('.phone-readiness-main h2'), 'mobile compaction must be explicit')

check(tests.includes('does not call a stale paired phone ready'), 'targeted regression must protect stale-vs-ready truthfulness')
check(tests.includes('branded confirmation before switching the selected SIM'), 'targeted regression must protect SIM-switch confirmation')
check(tests.includes('unselect and disconnect destructive actions behind branded confirmations'), 'targeted regression must protect destructive confirmations')
check(tests.includes('technical device metadata and pairing URI out of the default path'), 'targeted regression must protect progressive disclosure')
check(preflight.includes('phoneSimReadinessMarkers02011'), 'project preflight must enforce the 0.20.12 readiness contract')
check(!migrations.some((name) => name.includes('02011') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Phone & SIM Readiness Control Center source contract: PASS (${assertions} assertions)`)
