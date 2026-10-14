import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Campaign Confirmation & Send Safety UX source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const confirmation = await readFile(new URL('../src/pages/CampaignConfirmationPage.tsx', import.meta.url), 'utf8')
const detail = await readFile(new URL('../src/pages/CampaignDetailPage.tsx', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../src/components/ActionDialog.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const campaignUxTests = await readFile(new URL('../src/test/campaignUx.test.tsx', import.meta.url), 'utf8')
const safetyTests = await readFile(new URL('../src/test/campaignConfirmationSendSafety0207.test.tsx', import.meta.url), 'utf8')
const dialogTests = await readFile(new URL('../src/test/actionDialog0207.test.tsx', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')

check(dialog.includes('role="dialog"') && dialog.includes('aria-modal="true"'), 'branded action dialog must expose modal dialog semantics')
check(dialog.includes("event.key === 'Escape'") && dialog.includes("event.key !== 'Tab'"), 'dialog must support Escape and keyboard focus trapping')
check(dialog.includes("initialFocus = 'cancel'"), 'irreversible actions must default keyboard focus to the safe cancel action')

check(confirmation.includes('<ActionDialog') && confirmation.includes('title="Confirm campaign?"'), 'campaign confirmation must use the branded dialog')
check(!confirmation.includes('window.confirm('), 'campaign confirmation must not use a native browser confirm')
check(confirmation.includes('Nothing is sent yet.'), 'campaign confirmation must explicitly say that confirmation does not send')
check(confirmation.includes('Ready to confirm') && !confirmation.includes('Immutable confirmation') && !confirmation.includes('Freeze this campaign'), 'confirmation terminology must be user-facing')
check(campaignUxTests.includes("findByRole('dialog', { name: 'Confirm campaign?' })"), 'campaign UX regression must exercise the branded confirmation dialog')

check(detail.includes('title="Start sending?"') && detail.includes('Final send confirmation'), 'confirmed campaign must use a branded final send dialog')
check(detail.includes('Start sending to ${campaign.recipientCount.toLocaleString()} recipients'), 'main send CTA must state the recipient consequence')
check(detail.includes('Sending begins immediately after the final safety check.'), 'final dialog must state when real sending begins')
check(detail.includes('sendInFlight.current'), 'real send sequence must have an immediate duplicate-submit guard')
check(!detail.includes("'Send to Android'"), 'retired main Send to Android label must not return')
check(!detail.includes('0.18.1 safety boundary'), 'version-specific delivery safety warning must leave the normal UI')
check(detail.includes('Delivery safety diagnostics:') && detail.indexOf('Delivery safety diagnostics:') > detail.indexOf('<summary>Technical send details</summary>'), 'delivery implementation details must live under Technical send details')
check(detail.includes('<h2>Confirmed sending setup</h2>') && !detail.includes('<dt>Subscription</dt>'), 'primary confirmed setup must hide the internal subscription identifier')
check(detail.indexOf('confirmed-send-panel') < detail.indexOf('confirmation-metrics'), 'ready/send action must appear before frozen campaign detail cards')
check(detail.includes('data-label="Recipient"') && detail.includes('campaign-recipient-table-wrap'), 'recipient table must expose mobile card labels')

const freshCheck = detail.indexOf('const freshPreflight = await getCampaignSendPreflight')
const authorize = detail.indexOf('const freshAuthorization = await authorizeCampaignSend', freshCheck)
const enqueue = detail.indexOf('const nextDispatch = await enqueueCampaignDispatch', authorize)
check(freshCheck >= 0 && authorize > freshCheck && enqueue > authorize, 'existing preflight → authorization → durable queue order must be preserved')

check(styles.includes('.action-dialog-layer') && styles.includes('.action-dialog-summary'), 'branded dialog styles must exist')
check(styles.includes('.campaign-recipient-table { min-width: 0; display: block; }'), 'mobile recipient table must remove the fixed desktop minimum width')
check(styles.includes('content: attr(data-label)'), 'mobile recipient rows must expose visible field labels')
check(styles.includes('.confirmed-send-panel .primary-button { width: 100%;'), 'mobile primary send action must remain reachable without horizontal overflow')

check(safetyTests.includes('requires a branded final confirmation before the real send sequence and prevents duplicate submit'), 'final send confirmation/double-submit regression must exist')
check(safetyTests.includes('stops safely when the final phone and SIM check fails'), 'fresh-preflight failure regression must exist')
check(dialogTests.includes('focuses the safe cancel action') && dialogTests.includes('does not dismiss a busy irreversible action with Escape'), 'dialog keyboard-safety regressions must exist')
check(!migrations.some((name) => name.includes('0207') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Campaign Confirmation & Send Safety UX source contract: PASS (${assertions} assertions)`)
