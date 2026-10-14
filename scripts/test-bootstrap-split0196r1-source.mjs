import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const main = read('src/main.tsx')
const bootstrap = read('src/AppBootstrap.tsx')
const app = read('src/App.tsx')
const preflight = read('scripts/preflight.mjs')
const buildTest = read('scripts/test-route-loading0196-build.mjs')
const sw = read('public/service-worker.js')
const vite = read('vite.config.ts')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.5', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.5' && lock.packages?.['']?.version === '0.20.5', 'package-lock release version must match package.json')
check(Boolean(pkg.scripts?.['test:bootstrap-split-source-0196r1']), 'r1 source-contract command must exist')
check(Boolean(pkg.scripts?.['test:bootstrap-split-0196r1']), 'r1 focused runtime command must exist')
check(pkg.scripts?.['test:bundle-0196'] === 'node scripts/test-route-loading0196-build.mjs', 'original bundle gate command must remain authoritative')

check(main.includes("const AppBootstrap = lazy(() => import('./AppBootstrap'))"), 'application bootstrap must be dynamically imported from main')
check(main.includes('<Suspense fallback='), 'bootstrap dynamic import must have a visible loading fallback')
check(main.includes('<PwaProvider>') && main.includes('<BrowserRouter>'), 'PWA and browser-router boundaries must remain available before app bootstrap')
check(!main.includes("from './auth/AuthProvider'"), 'main entry must not statically import AuthProvider')
check(!main.includes("from './workspace/WorkspaceProvider'"), 'main entry must not statically import WorkspaceProvider')
check(!main.includes("import App from './App'"), 'main entry must not statically import the application route tree')

check(bootstrap.includes("import App from './App'"), 'bootstrap chunk must own the application route tree')
check(bootstrap.includes("from './auth/AuthProvider'"), 'bootstrap chunk must own AuthProvider')
check(bootstrap.includes("from './workspace/WorkspaceProvider'"), 'bootstrap chunk must own WorkspaceProvider')
check(bootstrap.includes('<AuthProvider>') && bootstrap.includes('<WorkspaceProvider>') && bootstrap.includes('<App />'), 'bootstrap must preserve provider nesting around App')

check(app.includes("import { LandingPage } from './pages/LandingPage'"), 'LandingPage must stay eager inside the loaded route tree')
check(app.includes("lazy(() => import('./components/AppShell')"), '0.19.6 route-level AppShell split must remain')
check(app.includes("lazy(() => import('./pages/CampaignsPage')"), '0.19.6 campaign route split must remain')
check(app.includes("lazy(() => import('./auth/LoginPage')"), '0.19.6 auth-route split must remain')

check(buildTest.includes('INITIAL_JS_BUDGET_BYTES = 500 * 1024'), 'initial static-JS budget must remain 500 KiB')
check(buildTest.includes('MAX_CHUNK_BYTES = 500_000'), 'largest chunk ceiling must stay below the Vite 500 kB warning threshold')
check(
  buildTest.includes("value?.name === 'AppBootstrap'") &&
    buildTest.includes('appEntry[1]?.dynamicImports?.includes(key)'),
  'build gate must verify AppBootstrap through Vite dynamic-entry metadata and the main-entry relationship',
)
check(buildTest.includes('!initialFiles.has(bootstrapEntry[1].file)'), 'build gate must prove bootstrap is outside the initial static graph')
check(vite.includes("manifest: 'asset-manifest.json'"), 'asset manifest must remain enabled for offline chunk precaching')
check(sw.includes("const VERSION = '0.20.5'"), 'service-worker cache marker must match corrective release')
check(sw.includes('buildManifestAssets'), 'lazy bootstrap and route chunks must remain included in PWA manifest precaching')
check(preflight.includes('test-bootstrap-split0196r1-source.mjs'), 'preflight must require the r1 source contract')
check(preflight.includes("'src/AppBootstrap.tsx'"), 'preflight required-file list must include the bootstrap module')
check(!fs.existsSync('supabase/migrations/20261012001961_bootstrap_chunk_correction.sql'), 'r1 must not add a database migration')

console.log(`Web 0.20.3 bootstrap chunk correction source contract: PASS (${assertions} assertions)`)
