import { readFile } from 'node:fs/promises'
import process from 'node:process'

const devices = await readFile(new URL('../src/pages/DevicesPage.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const assertions = [
  [packageJson.version === '0.20.3-r1', 'frontend version is 0.20.3'],
  [packageJson.bulktext?.backendContractVersion === '0.18.5', 'backend contract remains 0.18.5'],
  [devices.includes('className="page-stack devices-page"'), 'Phone & SIM page has scoped mobile containment root'],
  [devices.includes('className="data-table device-history-table"'), 'pairing history table has scoped class'],
  [css.includes('/* 0.18.10-a1 — Phone & SIM mobile containment */'), 'a1 CSS scope marker exists'],
  [css.includes('.devices-page > *'), 'Phone & SIM direct children can shrink inside the page grid'],
  [css.includes('.devices-page .panel'), 'Phone & SIM panels are width-contained'],
  [css.includes('.devices-page .pairing-layout'), 'pairing layout is width-contained'],
  [css.includes('.devices-page .pairing-details'), 'pairing details can shrink'],
  [css.includes('.devices-page .device-dashboard-card'), 'device cards can shrink'],
  [css.includes('.devices-page .table-wrap'), 'history scroller is width-contained'],
  [css.includes('min-width: 0;\n  max-width: 100%;'), 'containment uses min-width zero plus max-width 100%'],
  [css.includes('-webkit-overflow-scrolling: touch;'), 'history scroller keeps touch momentum'],
  [css.includes('.devices-page .device-history-table { min-width: 680px; }'), 'history table remains locally scrollable instead of widening the page'],
  [css.includes('.devices-page .device-card-header > div'), 'device header text can wrap'],
  [css.includes('.devices-page .sim-row > div:first-child'), 'SIM text can wrap'],
  [css.includes('.devices-page .device-card-footer > span'), 'device footer text can wrap'],
  [css.includes('.devices-page .panel-heading > .primary-button'), 'mobile panel primary action can fill available width'],
  [css.includes('.devices-page .pairing-qr-card { width: 100%; max-width: 280px; padding: 14px; }'), 'mobile QR card is capped to viewport-safe width'],
  [css.includes('.devices-page .pairing-qr { width: min(100%, 220px); }'), 'mobile QR image scales within card'],
  [css.includes('font-size: clamp(1.35rem, 8vw, 1.9rem);'), 'pairing code scales down on narrow screens'],
  [css.includes('word-break: break-word;'), 'pairing code has a narrow-screen wrap fallback'],
  [css.includes('.devices-page .notice { overflow-wrap: anywhere; }'), 'Phone & SIM notices cannot force page overflow'],
  [devices.includes('await createGatewayPairing(workspace.id)'), 'pairing creation call is unchanged'],
  [devices.includes('await revokeGatewayPairing(pairing.pairingId)'), 'pairing revocation call is unchanged'],
  [devices.includes('await bindGatewaySim(workspace.id, device.deviceId, sim.simId)'), 'SIM binding call is unchanged'],
  [devices.includes('await clearGatewaySimBinding(workspace.id, device.deviceId)'), 'clear-SIM call is unchanged'],
  [devices.includes('await revokeGatewayDevice(workspace.id, device.deviceId)'), 'device revoke call is unchanged'],
]

const failures = assertions.filter(([ok]) => !ok)
if (failures.length) {
  for (const [, label] of failures) console.error(`FAIL: ${label}`)
  process.exit(1)
}

console.log(`Web 0.20.3 Phone & SIM mobile source contract: PASS (${assertions.length} assertions)`)
