import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Campaign Delivery Experience source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const page = await readFile(new URL('../src/pages/CampaignDetailPage.tsx', import.meta.url), 'utf8')
const delivery = await readFile(new URL('../src/lib/deliveryAttempts.ts', import.meta.url), 'utf8')
const liveHook = await readFile(new URL('../src/lib/useCampaignLiveStatus.ts', import.meta.url), 'utf8')
const recipientDisplay = await readFile(new URL('../src/lib/recipientDisplay.ts', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const tests = await readFile(new URL('../src/test/campaignDeliveryExperience02010.test.tsx', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const preflight = await readFile(new URL('../scripts/preflight.mjs', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')

check(delivery.includes("'prepared' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'unknown'"), 'authoritative attempt-state vocabulary must remain intact')
check(delivery.includes('resolvedUnknownJobs'), 'resolved UNKNOWN helper must exist')
check(delivery.includes('processedDeliveryJobs'), 'processed send-outcome helper must exist')
check(delivery.includes('status.sentJobs + status.deliveredJobs + status.failedJobs + resolvedUnknownJobs(status)'), 'processed count must use settled states only')
check(!delivery.match(/processedDeliveryJobs[\s\S]{0,500}unresolvedUnknownJobs\s*\+/), 'unresolved UNKNOWN must not be counted as processed')
check(delivery.includes('processingProgress'), 'processing progress helper must exist')
check(delivery.includes('deliveryAttentionJobs'), 'attention helper must exist')
check(delivery.includes('status.failedJobs + status.unresolvedUnknownJobs'), 'attention must keep failed and unresolved UNKNOWN visible')

check(liveHook.includes('export const CAMPAIGN_POLL_MS = 5000'), 'active campaign polling must remain live at the existing safe cadence')
check(liveHook.includes('CAMPAIGN_IDLE_POLL_MS = 30_000'), 'idle polling backoff must remain intact')
check(liveHook.includes('getCampaignDeliveryStatus') && liveHook.includes('listCampaignMessageAttempts'), 'live status must continue reading authoritative delivery RPCs')
check(liveHook.includes('document.visibilityState') === false, 'campaign hook must remain delegated to adaptive polling rather than adding duplicate visibility logic')

check(page.includes('Live campaign status'), 'primary confirmed-campaign panel must expose live delivery status')
check(page.includes("title: 'Sending in progress'") && page.includes("title: 'Delivery confirmed'"), 'live presentation must distinguish active sending from fully delivered')
check(page.includes("title: 'Needs attention'") && page.includes('will not automatically resend'), 'UNKNOWN attention state must remain explicit and non-retrying')
check(page.includes("title: 'Completed with unverified results'"), 'resolved UNKNOWN must remain unverified rather than becoming SENT/DELIVERED')
check(page.includes("title: 'Sending complete'") && page.includes('Delivery receipts may continue to arrive.'), 'SENT completion must not be mislabeled as DELIVERED')
check(page.includes('className="live-processing-progress"'), 'primary processed-progress meter must exist')
check(page.includes('className="live-stage-grid"'), 'Android/SENT/DELIVERED stage presentation must exist')
check(page.includes('Android received') && page.includes('Known sent') && page.includes('Delivered'), 'stage labels must match real backend evidence')
check(page.includes('className="live-delivery-facts"'), 'compact live fact summary must exist')
check(page.includes('Needs attention'), 'attention count must be visible in the primary live panel')
check(page.includes('aria-live="polite"'), 'meaningful live status changes must be announced accessibly')

check(page.includes('Continue without resending') && page.includes('recoveryDialogOpen'), 'UNKNOWN recovery must use an explicit branded flow')
const recoveryFunction = page.match(/async function requestRecovery[\s\S]*?\n  }\n\n  async function removeCampaign/)?.[0] ?? ''
check(!recoveryFunction.includes('window.confirm'), 'UNKNOWN recovery must not use a native browser confirm')
check(page.includes('No SENT or DELIVERED claim will be made for these UNKNOWN recipients.'), 'recovery dialog must preserve the no-claim safety boundary')
check(page.includes("requestRecovery('skip_unknown')"), 'only existing skip-without-resend recovery action may be exposed')

check(page.includes('Callback status breakdown'), 'secondary delivery section must be a compact authoritative breakdown')
check(page.includes('className="delivery-state-breakdown"'), 'delivery-state breakdown visual must exist')
check(!page.includes('<article className="metric-card"><span>Awaiting attempt</span>'), 'old oversized delivery metric cards must be removed')
check(page.includes('maskRecipientNumber(attempt.normalizedE164)'), 'attempt-history recipient numbers must be masked')
check(recipientDisplay.includes('maskRecipientNumber'), 'shared masking helper must remain authoritative')
check(page.includes('No automatic resend'), 'attempt history must preserve resend-safety wording')

check(styles.includes('.live-delivery-panel') && styles.includes('.live-processing-progress'), 'primary live-delivery visual contracts must exist')
check(styles.includes('.live-stage-grid') && styles.includes('.live-delivery-facts'), 'live stage/fact layouts must exist')
check(styles.includes('.delivery-state-breakdown') && styles.includes('.live-recovery-action'), 'breakdown and recovery layouts must exist')
check(styles.includes('@media (max-width: 560px)') && styles.includes('.delivery-state-breakdown { grid-template-columns: repeat(2,minmax(0,1fr)); }'), 'delivery experience must stay compact on mobile')
check(tests.includes('authoritative live sending progress') && tests.includes('UNKNOWN as attention') && tests.includes('fully delivered only'), 'targeted regressions must cover active, UNKNOWN and delivered states')
check(tests.includes('masks recipient numbers in diagnostic attempt history'), 'targeted regression must cover delivery privacy')
check(preflight.includes('campaignDeliveryMarkers02010'), 'project preflight must enforce the 0.20.12 delivery experience contract')
check(!migrations.some((name) => name.includes('02010') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Campaign Delivery Experience source contract: PASS (${assertions} assertions)`)
