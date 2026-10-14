import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const app = read('src/App.tsx')
const layout = read('src/auth/AuthLayout.tsx')
const login = read('src/auth/LoginPage.tsx')
const signup = read('src/auth/SignupPage.tsx')
const passwordField = read('src/auth/PasswordField.tsx')
const provider = read('src/auth/AuthProvider.tsx')
const styles = read('src/styles/app.css')
const runtime = read('src/test/authMobilePolish0203.test.tsx')
const sw = read('public/service-worker.js')
const preflight = read('scripts/preflight.mjs')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.5-r1', 'frontend version must be 0.20.3')
check(lock.version === '0.20.5-r1' && lock.packages?.['']?.version === '0.20.5-r1', 'package-lock release version must match package.json')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(pkg.scripts?.['test:auth-mobile-polish-source-0203'] === 'node scripts/test-auth-mobile-polish0203-source.mjs', '0.20.3 source contract script must exist')
check(pkg.scripts?.['test:auth-mobile-polish-0203']?.includes('src/test/authMobilePolish0203.test.tsx'), '0.20.3 runtime command must exist')
check(pkg.scripts?.['certify:0203'] === 'node scripts/certify-production0203.mjs', '0.20.3 certification command must exist')

check(app.includes('path="/auth/login"') && app.includes('path="/auth/signup"'), 'sign-in and signup routes must remain unchanged')
check(layout.includes('className="auth-card-wrap"') && layout.includes('className="auth-card"'), 'shared auth shell must remain authoritative')
check(layout.includes('/icons/icon-192.png') && layout.includes('Your SIM. Your Messages. Your Reach.'), 'mobile brand identity must remain intact')
check(login.includes('title="Welcome back"') && login.includes('Sign in to your BulkText workspace.'), 'sign-in hierarchy/copy must remain concise')
check(signup.includes('title="Create your account"'), 'signup heading must remain explicit')
check(signup.includes('Create your BulkText workspace and connect your Android gateway.'), 'signup supporting copy must be compact')
check(signup.includes('>Name<input'), 'signup name label must use the compact Name wording')
check(login.includes('className="text-link auth-recovery-link"'), 'forgot-password action must use the secondary hierarchy')

check(login.includes("import { PasswordField } from './PasswordField'"), 'sign-in must use the shared password control')
check(signup.includes("import { PasswordField } from './PasswordField'"), 'signup must use the shared password control')
check(passwordField.includes("const [visible, setVisible] = useState(false)"), 'password visibility must be local presentation state only')
check(passwordField.includes("type={visible ? 'text' : 'password'}"), 'password control must toggle only its input presentation')
check(passwordField.includes("const toggleLabel = visible ? 'Hide password' : 'Show password'"), 'password toggle must expose state-specific accessible labels')
check(passwordField.includes('aria-pressed={visible}'), 'password toggle must expose pressed state')
check(passwordField.includes('type="button"'), 'password toggle must never submit the form')
check(passwordField.includes('width="') === false, 'password icon must be styled through CSS instead of fixed inline dimensions')
check(signup.includes('describedBy="signup-password-help"') && passwordField.includes('aria-describedby={describedBy}'), 'signup password guidance association must remain intact')
check(signup.includes('At least 8 characters.'), 'signup password guidance must be concise')

check(login.includes('aria-busy={busy}') && signup.includes('aria-busy={busy}'), 'auth forms must retain async busy semantics')
check(login.includes('disabled={busy}') && signup.includes('disabled={busy}'), 'auth controls must protect pending submissions')
check(login.includes('Signing in…') && signup.includes('Creating account…'), 'auth CTA loading labels must remain explicit')
check(login.includes('auth-button-spinner') && signup.includes('auth-button-spinner'), 'loading state must have a compact visual spinner')
check(login.includes('role="alert"') && signup.includes('role="alert"'), 'auth failures must remain announced')
check(!login.includes('supabase.') && !signup.includes('supabase.'), 'presentation pages must not bypass AuthProvider')
check(provider.includes('signInWithPassword') && provider.includes('client.auth.signUp'), 'underlying auth behavior must remain in AuthProvider')

check(styles.includes('/* 0.20.3 — Auth screen mobile polish */'), '0.20.3 auth CSS section required')
check(styles.includes('place-items: start center'), 'mobile auth cards must be top-aligned instead of vertically centered')
check(styles.includes('min-height: 100svh'), 'mobile auth shell must use viewport-safe natural scrolling height')
check(styles.includes('height: 56px') && styles.includes('min-height: 56px'), 'approved 56px auth inputs/CTA sizing must be explicit')
check(styles.includes('border-radius: 22px') && styles.includes('border-radius: 14px'), 'auth card/control radius hierarchy must remain explicit')
check(styles.includes('.auth-password-toggle') && styles.includes('width: 44px') && styles.includes('height: 44px'), 'password visibility control must meet the 44px target size')
check(styles.includes('input:-webkit-autofill'), 'autofill appearance must be intentionally normalized')
check(styles.includes('@media (max-width: 360px)'), 'narrow 320-360px auth guard must remain present')
check(styles.includes('@media (max-width: 900px) and (max-height: 700px)'), 'short-screen top-spacing guard must remain present')

check(runtime.includes('provides an accessible show and hide password control on sign in'), 'runtime coverage must verify password visibility semantics')
check(runtime.includes('keeps auth inputs and password visibility control disabled while sign in is pending'), 'runtime coverage must verify pending-state safety')
check(sw.includes("const VERSION = '0.20.5-r1'"), 'service-worker cache version must advance to 0.20.3 for new static auth assets')
check(preflight.includes('test-auth-mobile-polish0203-source.mjs'), 'preflight must require the 0.20.3 auth source contract')
check(!fs.existsSync('supabase/migrations/20261013002030_auth_screen_mobile_polish.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 auth screen mobile polish source contract: PASS (${assertions} assertions)`)
