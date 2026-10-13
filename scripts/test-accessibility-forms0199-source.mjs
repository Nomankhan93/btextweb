import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const login = read('src/auth/LoginPage.tsx')
const signup = read('src/auth/SignupPage.tsx')
const passwordField = read('src/auth/PasswordField.tsx')
const forgot = read('src/auth/ForgotPasswordPage.tsx')
const reset = read('src/auth/ResetPasswordPage.tsx')
const settings = read('src/pages/SettingsPage.tsx')
const phones = read('src/pages/PhoneNumbersPage.tsx')
const imports = read('src/pages/ImportsPage.tsx')
const composer = read('src/pages/MessageComposerPage.tsx')
const simple = read('src/pages/SimpleCampaignPage.tsx')
const styles = read('src/styles/app.css')
const runtimeTests = read('src/test/accessibilityForms0199.test.tsx')
const preflight = read('scripts/preflight.mjs')
const sw = read('public/service-worker.js')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.4', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.4' && lock.packages?.['']?.version === '0.20.4', 'package-lock release version must match package.json')
check(pkg.scripts?.['test:accessibility-forms-source-0199'] === 'node scripts/test-accessibility-forms0199-source.mjs', 'source contract command must exist')
check(pkg.scripts?.['test:accessibility-forms-0199']?.includes('src/test/accessibilityForms0199.test.tsx'), 'focused accessibility command must include the new regression suite')

check(login.includes('aria-busy={busy}'), 'login form must expose busy state')
check(login.includes('id="login-form-error"') && login.includes('role="alert"'), 'login failure must be an assertive live error')
check(login.includes("aria-describedby={error ? 'login-form-error' : undefined}"), 'login form must reference its failure message')
check(signup.includes('aria-busy={busy}'), 'signup form must expose busy state')
check(signup.includes('describedBy="signup-password-help"') && passwordField.includes('aria-describedby={describedBy}'), 'signup password must reference password guidance through the shared password field')
check(signup.includes('id="signup-password-help"'), 'signup password guidance must have a stable id')
check(signup.includes('role="alert"'), 'signup error must be announced')
check(forgot.includes('role="status"') && forgot.includes('role="alert"'), 'password reset request success/error feedback must be announced')
check(reset.includes('aria-describedby="reset-password-help"'), 'new-password field must reference its guidance')
check(reset.includes('role="status"') && reset.includes('role="alert"'), 'password reset session/error feedback must be announced')

check(settings.includes('aria-busy={busy}'), 'profile form must expose busy state')
check(settings.includes('aria-describedby="settings-email-help"'), 'managed email field must reference explanatory help')
check(settings.includes('role="status"'), 'settings success/offline feedback must use status semantics')

check(phones.includes('aria-describedby="phone-number-rules"'), 'phone checker textarea must reference format rules')
check(phones.includes('id="phone-number-rules"'), 'phone-number rules must have a stable id')
check(phones.includes('aria-live="polite"') && phones.includes('aria-atomic="true"'), 'phone checker validation badge must announce changes politely')
check(phones.includes('<caption className="sr-only">Phone number normalization results</caption>'), 'phone result table must expose a caption')

check(imports.includes('role="alert"'), 'import blocking failures must be announced')
check(imports.includes('role="status"'), 'import success/detection feedback must be announced')
check(imports.includes('aria-busy={busy}'), 'import upload control must expose file-processing busy state')
check(imports.includes('aria-describedby="import-file-help"'), 'import file picker must reference format guidance')
check(imports.includes('aria-required="true" disabled={busy}'), 'required phone mapping must be programmatically exposed')

check(composer.includes('aria-required="true"'), 'composer required controls must expose required semantics')
check(composer.includes('aria-invalid={hasTemplateProblem || undefined}'), 'composer message must expose invalid template state')
check(composer.includes("'composer-message-help'"), 'composer message must reference its help text')
check(composer.includes('id="composer-message-malformed"') && composer.includes('id="composer-message-unsupported"'), 'composer template errors must have stable ids')
check(composer.includes('role="alert"'), 'composer blocking errors must be announced')

check(simple.includes('aria-required="true"'), 'simple campaign required controls must expose required semantics')
check(simple.includes('aria-describedby="simple-import-file-help"'), 'simple import picker must reference guidance')
check(simple.includes('aria-invalid={(templateAnalysis.malformed || templateAnalysis.unsupportedTokens.length > 0) || undefined}'), 'simple message must expose invalid template state')
check(simple.includes("'simple-message-help'"), 'simple message must reference its help text')
check(simple.includes('id="simple-message-malformed"') && simple.includes('id="simple-message-unsupported"'), 'simple message errors must have stable ids')
check(simple.includes('role="alert"') && simple.includes('role="status"'), 'simple campaign blocking/status feedback must be announced')

check(styles.includes('button:focus-visible') && styles.includes('textarea:focus-visible'), 'visible keyboard focus contract must remain enabled')
check(styles.includes('.primary-button, .secondary-button, .danger-button') && styles.includes('min-height: 44px'), '44px interactive target contract must remain intact')
check(styles.includes('.sr-only'), 'visually-hidden accessible text utility must remain available')

check(runtimeTests.includes('announces sign-in failures and exposes the async form busy state'), 'runtime coverage must include auth busy/error feedback')
check(runtimeTests.includes('programmatically associates password guidance'), 'runtime coverage must include password helper association')
check(runtimeTests.includes('Phone number normalization results'), 'runtime coverage must include phone-table accessible naming')
check(preflight.includes('test-accessibility-forms0199-source.mjs'), 'preflight must require the 0.20.3 accessibility source contract')
check(sw.includes("const VERSION = '0.20.4'"), 'service-worker cache marker must match 0.20.3')
check(!fs.existsSync('supabase/migrations/20261013001990_accessibility_forms.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 accessibility & form interaction source contract: PASS (${assertions} assertions)`)
