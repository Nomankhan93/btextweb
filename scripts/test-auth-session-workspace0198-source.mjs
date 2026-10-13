import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const auth = read('src/auth/AuthProvider.tsx')
const requireAuth = read('src/auth/RequireAuth.tsx')
const returnTo = read('src/auth/returnTo.ts')
const login = read('src/auth/LoginPage.tsx')
const callback = read('src/auth/AuthCallbackPage.tsx')
const workspace = read('src/workspace/WorkspaceProvider.tsx')
const locator = read('src/lib/offlineWorkspaceLocator.ts')
const authTests = read('src/test/authReliability.test.tsx')
const workspaceTests = read('src/test/workspaceReliability.test.tsx')
const routeTests = read('src/test/publicRootRouting0191.test.tsx')
const boundaryTests = read('src/test/authBoundary0198.test.ts')
const preflight = read('scripts/preflight.mjs')
const sw = read('public/service-worker.js')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.3-r1', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.3-r1' && lock.packages?.['']?.version === '0.20.3-r1', 'package-lock release version must match package.json')
check(pkg.scripts?.['test:auth-boundary-source-0198'] === 'node scripts/test-auth-session-workspace0198-source.mjs', 'source contract command must exist')
check(pkg.scripts?.['test:auth-boundary-0198']?.includes('src/test/authBoundary0198.test.ts'), 'focused auth boundary command must include return-target coverage')
check(pkg.scripts?.['test:auth-boundary-0198']?.includes('src/test/authReliability.test.tsx'), 'focused auth boundary command must include session reliability coverage')
check(pkg.scripts?.['test:auth-boundary-0198']?.includes('src/test/workspaceReliability.test.tsx'), 'focused auth boundary command must include workspace reliability coverage')

check(auth.includes('revalidateSession: () => Promise<boolean>'), 'auth context must expose explicit session revalidation')
check(auth.includes('supabase.auth.getUser()'), 'session revalidation must validate against Supabase rather than trusting local state only')
check(auth.includes("window.addEventListener('online'"), 'session must revalidate after reconnect')
check(auth.includes("window.addEventListener('focus'"), 'session must revalidate when the tab regains focus')
check(auth.includes("document.addEventListener('visibilitychange'"), 'session must revalidate when the document becomes visible')
check(auth.includes('revalidationInFlight'), 'concurrent lifecycle revalidations must be coalesced')
check(auth.includes('request !== generation.current'), 'stale revalidation responses must not mutate the current session')
check(auth.includes('clearAccountScopedState'), 'account boundary cleanup must be centralized')
check(auth.includes('clearCampaignDrafts()'), 'account boundary cleanup must clear campaign drafts')
check(auth.includes('clearOfflineWorkspaceLocators()'), 'account boundary cleanup must clear remembered workspace locators')
check(auth.includes('clearRecentDiagnosticEvents()'), 'account switches/sign-out must not retain prior account diagnostic history')
check(auth.includes("category === 'authentication' || category === 'permission'"), 'invalid authenticated identity responses must invalidate the local session')
check(auth.includes("category === 'domain' ? 'unknown' : category"), 'transient revalidation failures must remain diagnostic without forced sign-out')

check(returnTo.includes('protectedReturnTo'), 'exact protected return target helper must exist')
check(returnTo.includes('safeReturnTo'), 'safe post-login return target helper must exist')
check(returnTo.includes("raw.startsWith('//')"), 'protocol-relative return targets must be rejected')
check(returnTo.includes("raw.includes('\\\\')"), 'backslash-based external return targets must be rejected')
check(returnTo.includes("parsed.pathname.startsWith('/auth/')"), 'auth-loop return targets must be rejected')
check(requireAuth.includes('protectedReturnTo(location)'), 'RequireAuth must preserve pathname/search/hash through the helper')
check(login.includes("navigate(safeReturnTo(searchParams.get('returnTo'))"), 'login must sanitize returnTo before navigation')
check(callback.includes("safeReturnTo(searchParams.get('returnTo'))"), 'auth callback must sanitize returnTo before navigation')

check(locator.includes('clearOfflineWorkspaceLocator(userId: string)'), 'single-user workspace locator invalidation helper must exist')
check(workspace.includes("category === 'authentication' || category === 'permission'"), 'workspace refresh must distinguish authorization loss from transient errors')
check(workspace.includes('clearOfflineWorkspaceLocator(userId)'), 'authorization loss must clear the cached workspace locator')
check(workspace.includes("setState({ owner: userId, workspace: null, authority: null"), 'authorization loss must drop verified workspace authority immediately')
check(workspace.includes("if (category === 'authentication') void revalidateSession()"), 'workspace authentication failures must trigger session validation')
check(workspace.includes("window.addEventListener('online'"), 'workspace must revalidate after reconnect')
check(workspace.includes("window.addEventListener('focus'"), 'workspace must revalidate on focus')
check(workspace.indexOf('if (request === generation.current) {\n        writeOfflineWorkspaceLocator') > -1, 'only the latest workspace response may update the cached locator')

check(authTests.includes('revalidates on focus, expires an invalid session and clears prior account-scoped state'), 'expired-session focus recovery regression must be covered')
check(authTests.includes('preserves a valid mounted session when background revalidation only hits the network'), 'network-only revalidation failure must preserve the mounted session')
check(workspaceTests.includes('drops verified workspace authority immediately when server permission is revoked'), 'workspace authorization revocation regression must be covered')
check(routeTests.includes('/campaigns?status=active#queued'), 'protected returnTo must cover exact query and hash preservation')
check(routeTests.includes('does not honor an external or auth-loop return target after sign in'), 'unsafe post-login return targets must be covered')
check(boundaryTests.includes("safeReturnTo('https://example.com/steal')"), 'external return target rejection must have direct unit coverage')
check(boundaryTests.includes("safeReturnTo('/auth/login?returnTo=/campaigns')"), 'auth-loop return target rejection must have direct unit coverage')

check(preflight.includes('test-auth-session-workspace0198-source.mjs'), 'preflight must require the 0.20.3 boundary source contract')
check(sw.includes("const VERSION = '0.20.3-r1'"), 'service-worker cache marker must match 0.20.3')
check(!fs.existsSync('supabase/migrations/20261013001980_auth_session_workspace_boundary.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 auth/session/workspace boundary source contract: PASS (${assertions} assertions)`)
