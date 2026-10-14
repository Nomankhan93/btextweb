import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const app = read('src/App.tsx')
const integration = read('src/test/publicRootRouting0191.test.tsx')
const landing = read('src/pages/LandingPage.tsx')
const requireAuth = read('src/auth/RequireAuth.tsx')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.5', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(Boolean(pkg.scripts?.['test:public-root-0191']), '0.20.3 App-level routing regression script must exist')
check(Boolean(pkg.scripts?.['test:public-root-source-0191']), '0.20.3 source contract script must exist')
check(app.includes('<Route path="/" element={<PublicHomeRoute />} />'), 'public root must have an explicit route')
check((app.match(/path="\/"/g) ?? []).length === 1, 'root path must have exactly one explicit owner')
check(!app.includes('<Route index element={<Navigate to="/dashboard" replace />} />'), 'protected shell must not also claim the root index')
check(app.includes('user ? <Navigate to="/dashboard" replace /> : <LandingPage />'), 'signed-in root must redirect to dashboard while signed-out root renders LandingPage')
check(requireAuth.includes('returnTo=${encodeURIComponent(returnTo)}'), 'protected routes must preserve encoded returnTo behavior')
check(integration.includes("renderRoute('/')"), 'integration regression must exercise the actual App root route')
check(integration.includes("'/campaigns?status=active#queued'"), 'integration regression must exercise a signed-out protected route with query string')
check(integration.includes("'/auth/login?returnTo=%2Fcampaigns%3Fstatus%3Dactive%23queued'"), 'integration regression must assert exact returnTo encoding')
check(integration.includes("name: 'Business SMS, sent from your own SIM.'"), 'integration regression must prove signed-out root reaches the real landing experience')
check(integration.includes("name: 'Dashboard route'"), 'integration regression must prove signed-in root redirects to dashboard')
check(integration.includes("findAllByRole('link', { name: 'Sign in' })"), 'integration regression must verify the landing Sign in navigation')
check(landing.includes('Business SMS, sent from your own SIM.'), 'existing public landing content must remain intact')
check(!fs.existsSync('supabase/migrations/20261012001910_public_root.sql'), '0.20.3 must not introduce a database migration')

console.log(`Web 0.20.3 Public Landing Root Routing source contract: PASS (${assertions} assertions)`)
