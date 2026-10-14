import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Campaign Wizard Simplification source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const campaign = await readFile(new URL('../src/pages/SimpleCampaignPage.tsx', import.meta.url), 'utf8')
const confirmation = await readFile(new URL('../src/pages/CampaignConfirmationPage.tsx', import.meta.url), 'utf8')
const shell = await readFile(new URL('../src/components/AppShell.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const wizardTests = await readFile(new URL('../src/test/campaignWizardSimplification0208.test.tsx', import.meta.url), 'utf8')
const campaignUxTests = await readFile(new URL('../src/test/campaignUx.test.tsx', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const preflight = await readFile(new URL('../scripts/preflight.mjs', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')

check(campaign.includes('type WizardStep = 1 | 2 | 3'), 'campaign creation must use explicit one-step wizard state')
check(campaign.includes('wizardStep === 1 ?') && campaign.includes('wizardStep === 2 ?') && campaign.includes('wizardStep === 3 && prepared ?'), 'only the active campaign step must render its editable form')
check(campaign.includes("onClick={() => setWizardStep(2)}>Continue to recipients"), 'campaign step must explicitly advance to recipients')
check(campaign.includes("setWizardStep(3)\n      setNotice"), 'successful recipient preparation must advance to Message')
check(campaign.includes("onClick={() => setWizardStep(2)}>Back</button><button") || campaign.includes("onClick={() => setWizardStep(2)}>Back</button>"), 'message step must support Back to recipients')
check(!campaign.includes('const currentStep = !parsed'), 'old data-derived pseudo-stepper must be removed')

check(campaign.includes('Draft saved') && campaign.includes('Available on this browser.'), 'draft state must use concise user-facing copy')
check(!campaign.includes('Last committed local save'), 'old verbose local-save copy must be removed from the main UI')
check(!campaign.includes('“Saved” is shown only after the IndexedDB transaction commits.'), 'IndexedDB transaction copy must not remain in the user-facing draft status')
check(campaign.includes('title="Discard this draft?"') && !campaign.includes("window.confirm('Discard"), 'discard must use the branded action dialog')

check(campaign.includes('Upload recipient list') && campaign.includes('CSV or XLSX · Mobile number column required'), 'recipient upload must use a compact custom upload surface')
check(!campaign.includes('bytesLabel('), 'file byte-size helper must leave the campaign wizard')
check(campaign.includes('simple-import-summary-line') && campaign.includes('duplicates') && campaign.includes('invalid'), 'recipient validation must be a compact summary line')
check(campaign.includes('✓ Phone column detected') && !campaign.includes('<strong>Smart detection:</strong>'), 'smart detection must be concise')
check(campaign.includes('<details className="advanced-mapping"'), 'advanced mapping must remain available as disclosure')
check(campaign.includes("open={!mapping.phone || detection.confidence === 'low'}"), 'advanced mapping may auto-open only when mapping is missing/uncertain')
check(campaign.includes('<details className="consent-reference-details"><summary>Add consent reference (optional)</summary>'), 'optional consent evidence must be collapsed')
check(campaign.includes('Blocked/do-not-send numbers will still be excluded automatically.'), 'consent copy must retain do-not-send safety in concise language')
check(campaign.includes('Continue to message') && !campaign.includes('Continue with ${uniqueReady.toLocaleString()} unique numbers'), 'recipient CTA must be task-oriented instead of system terminology')
check(campaign.includes('✓ Invalid, duplicate and blocked numbers are excluded automatically.'), 'recipient safety must remain visible once without repeated warning copy')
check(!campaign.includes('<strong>Safety stays automatic:</strong>'), 'repeated yellow safety callout must leave the wizard')

check(shell.includes("location.pathname === '/campaigns/new' || location.pathname.startsWith('/campaigns/review/')"), 'focused shell must cover creation and review routes')
check(shell.includes("campaign-wizard-shell"), 'app shell must expose focused-wizard state')
check(styles.includes('.campaign-wizard-shell .mobile-bottom-nav { display: none; }'), 'global mobile bottom navigation must hide during the campaign wizard')
check(styles.includes('.campaign-wizard-shell .topbar { display: none; }'), 'global mobile topbar must hide during the focused wizard')
check(styles.includes('.campaign-wizard-mobile-header') && styles.includes('.simple-wizard-actions'), 'focused mobile header and wizard action layout must exist')
check(styles.includes('position: sticky;') && styles.includes('bottom: max(6px, env(safe-area-inset-bottom));'), 'mobile wizard actions must remain reachable above the safe area')

check(confirmation.includes('campaign-review-stepper') && confirmation.includes('aria-current="step"'), 'review page must visibly continue the four-step wizard')
check(confirmation.includes('campaign-wizard-mobile-header') && confirmation.includes('← Message'), 'review mobile shell must offer an explicit return to Message')
check(confirmation.includes('Nothing is sent yet.'), '0.20.12 confirm/send safety boundary must remain intact')

check(wizardTests.includes('shows exactly one editable wizard step at a time'), 'one-step wizard regression must exist')
check(wizardTests.includes('compresses recipient preparation and keeps mapping/evidence collapsed by default'), 'recipient compression regression must exist')
check(wizardTests.includes('can go back without re-running the import'), 'back-navigation must not duplicate preparation writes')
check(wizardTests.includes('uses a branded draft-discard dialog instead of a native confirm'), 'discard-dialog regression must exist')
check(campaignUxTests.includes("name: 'Continue to message'"), 'historical campaign UX suite must target the new recipient CTA')
check(preflight.includes('campaignWizardMarkers0208') && preflight.includes('focused campaign shell routing contract'), 'project preflight must enforce the 0.20.12 wizard contract')
check(!migrations.some((name) => name.includes('0208') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Campaign Wizard Simplification source contract: PASS (${assertions} assertions)`)
