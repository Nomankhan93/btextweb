import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Message & Review Experience source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const campaign = await readFile(new URL('../src/pages/SimpleCampaignPage.tsx', import.meta.url), 'utf8')
const confirmation = await readFile(new URL('../src/pages/CampaignConfirmationPage.tsx', import.meta.url), 'utf8')
const composer = await readFile(new URL('../src/lib/messageComposer.ts', import.meta.url), 'utf8')
const recipientDisplay = await readFile(new URL('../src/lib/recipientDisplay.ts', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const tests = await readFile(new URL('../src/test/campaignMessageReview0209.test.tsx', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const preflight = await readFile(new URL('../scripts/preflight.mjs', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')

check(composer.includes('availablePersonalizationTokens'), 'message composer library must expose safe data-driven personalization options')
check(composer.includes("{ token: 'name', label: 'Name' }"), 'Name personalization option must exist')
check(composer.includes("{ token: 'phone', label: 'Phone' }"), 'Phone personalization option must exist')
check(composer.includes('rows.every((row) => tokenValue(row, candidate.token) != null)'), 'personalization options must require a value for every prepared recipient')
check(campaign.includes('personalizationTokens = useMemo(() => availablePersonalizationTokens'), 'campaign composer must derive safe personalization controls from prepared rows')
check(campaign.includes('insertPersonalizationToken(token: string)'), 'campaign composer must support click-to-insert personalization')
check(campaign.includes('className="personalization-controls"') && campaign.includes('className="personalization-token"'), 'personalization controls must be explicit accessible buttons')
check(!campaign.includes('Use <code>{\'{{name}}\'}</code> only when the uploaded file contains names.'), 'old syntax-memorization helper must be removed')

check(campaign.includes('messageCharacters') && campaign.includes('message-live-summary'), 'composer must expose live character/SMS summary')
check(campaign.includes('usage.encodingSummary') && campaign.includes('segmentSummary') && campaign.includes('usage.estimatedSmsUnits'), 'live summary must include encoding, segments and estimated SMS')
check(campaign.includes('Unicode detected.') && campaign.includes("usage.encodingSummary === 'Unicode' || usage.encodingSummary === 'Mixed'"), 'Unicode cost/segment warning must be conditional')
check(!campaign.includes('className="metric-grid simple-message-metrics"'), 'three oversized composer metric cards must leave the primary flow')
check(!campaign.includes('Estimated SMS units</span><h2>'), 'old composer estimated-SMS metric card must be removed')

check(recipientDisplay.includes('maskRecipientNumber'), 'recipient-number masking helper must exist')
check(recipientDisplay.includes("'•'.repeat"), 'recipient masking must obscure middle digits')
check(campaign.includes('maskRecipientNumber(row.normalization.normalizedE164 ?? row.rawPhone)'), 'recipient preparation preview must mask phone numbers')
check(confirmation.includes('maskRecipientNumber(preview.row.normalizedE164)'), 'review recipient preview must mask phone numbers')
check(!confirmation.includes('<code>{preview.row.normalizedE164}</code>'), 'review must not expose full recipient phone numbers by default')

check(confirmation.includes('className="review-summary-strip"'), 'review must use one compact campaign summary strip')
check(!confirmation.includes('className="metric-grid confirmation-metrics"'), 'review must remove four oversized metric cards')
check(confirmation.includes('~{usage.estimatedSmsUnits.toLocaleString()} SMS'), 'review summary must use user-facing Estimated SMS wording')
check(confirmation.includes('featuredPreviews = useMemo(() => previewableRecipients.slice(0, 3)'), 'default review recipient preview must be capped at three')
check(confirmation.includes('Preview first ${Math.min(100, previewableRecipients.length).toLocaleString()} recipients'), 'review must offer an explicit recipient expansion')
check(confirmation.includes('expandedPreviews = useMemo(() => previewableRecipients.slice(3, 100)'), 'expanded review must retain a DOM safety cap')
check(confirmation.includes('personalized = templateAnalysis.tokens.length > 0'), 'review must distinguish personalized from shared messages')
check(confirmation.includes('Everyone receives the message shown above.'), 'non-personalized review must avoid repeating identical messages for each recipient')
check(confirmation.includes('Personalized examples are shown below.'), 'personalized review must explain why rendered examples are shown')

check(confirmation.includes('<h2>Phone &amp; SIM</h2>') && confirmation.includes('className="review-sending-card"'), 'sending identity must be compact and user-facing')
check(!confirmation.includes('Sending identity snapshot'), 'old snapshot-oriented heading must be removed')
check(!confirmation.includes('The server will render the template again'), 'server-render implementation copy must leave normal review UI')
check(!confirmation.includes('Confirmation freezes this phone and SIM reference'), 'duplicate exact-SIM technical explanation must leave normal review UI')
check(confirmation.includes('Nothing is sent yet.'), 'confirmation/send safety boundary must remain explicit')

check(styles.includes('.personalization-controls') && styles.includes('.message-live-summary'), 'composer visual contracts must exist')
check(styles.includes('.review-summary-strip') && styles.includes('.review-recipient-row'), 'compact review visual contracts must exist')
check(styles.includes('.review-all-recipients') && styles.includes('max-height: 52vh'), 'expanded recipient review must remain bounded')
check(tests.includes('compact live composer metrics') && tests.includes('masks recipient numbers') && tests.includes('limits the default recipient preview to three rows'), '0.20.12 targeted regressions must cover composer/review/privacy behavior')
check(preflight.includes('campaignMessageReviewMarkers0209') && preflight.includes('recipientDisplaySource0209'), 'project preflight must enforce the 0.20.12 message/review contract')
check(!migrations.some((name) => name.includes('0209') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Message & Review Experience source contract: PASS (${assertions} assertions)`)
