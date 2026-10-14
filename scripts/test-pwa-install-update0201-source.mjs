import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const provider = read('src/pwa/PwaProvider.tsx')
const prompt = read('src/components/PwaExperiencePrompts.tsx')
const landing = read('src/pages/LandingPage.tsx')
const main = read('src/main.tsx')
const status = read('src/components/PwaStatus.tsx')
const sw = read('public/service-worker.js')
const styles = read('src/styles/app.css')
const preflight = read('scripts/preflight.mjs')
const certifier = read('scripts/certify-production0201.mjs')
const runtimeTest = read('src/test/pwaInstallUpdate0201.test.tsx')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.12', 'frontend version must be 0.20.3')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(pkg.scripts?.['test:pwa-install-update-source-0201'] === 'node scripts/test-pwa-install-update0201-source.mjs', 'source contract command must exist')
check(Boolean(pkg.scripts?.['test:pwa-install-update-0201']), 'runtime install/update test command must exist')
check(pkg.scripts?.['certify:0201'] === 'node scripts/certify-production0201.mjs', '0.20.3 certification command must exist')

for (const marker of [
  "beforeinstallprompt",
  'appinstalled',
  "INSTALL_DISMISS_KEY = 'bulktext:pwa-install-dismissed-until:v1'",
  'INSTALL_DISMISS_MS = 3 * 24 * 60 * 60 * 1000',
  'installPromptVisible',
  'dismissInstallPrompt',
  'window.localStorage.setItem',
  'window.localStorage.removeItem',
]) {
  check(provider.includes(marker), `install lifecycle must preserve ${marker}`)
}

check(provider.includes('const canInstall = Boolean(installPrompt) && !installed'), 'canInstall must remain independent of automatic prompt dismissal')
check(provider.includes('installPromptVisible: canInstall && !installDismissed'), 'automatic install prompt must respect dismissal while manual install remains possible')
check(provider.includes("if (choice.outcome === 'accepted')"), 'accepted browser installation must transition to installed state')
check(provider.includes('storeInstallDismissal()') && provider.includes("choice.outcome"), 'native prompt dismissal must suppress repeated automatic prompting')
check(provider.includes('waitingWorkerRef.current !== worker'), 'Later must remain respected for the same waiting worker')
check(provider.includes('setUpdateDismissed(false)'), 'a genuinely new waiting worker must re-enable the update prompt')
check(provider.includes("waitingWorker.postMessage({ type: 'SKIP_WAITING' })"), 'Update now must explicitly activate the waiting worker')
check(provider.includes("window.location.reload()"), 'controller change after explicit activation must reload once')
check(provider.includes("window.addEventListener('focus'"), 'foreground return must trigger periodic update checks')
check(provider.includes("window.addEventListener('online'"), 'reconnect must trigger a forced update check')
check(provider.includes("document.addEventListener('visibilitychange'"), 'visible-tab return must trigger periodic update checks')
check(provider.includes('runUpdateCheck(true)'), 'registration and reconnect must actively check for a new service worker')

check(prompt.includes('Install BulkText App'), 'branded automatic install prompt required')
check(prompt.includes('Not now') && prompt.includes('Install App'), 'install prompt must offer Install App and Not now')
check(prompt.includes('BulkText update ready'), 'update-ready prompt required')
check(prompt.includes('Update now') && prompt.includes('Later'), 'update prompt must be user-controlled')
check(!prompt.includes('window.location.reload'), 'prompt UI itself must not force reload')
check(main.includes("lazy(() => import('./components/PwaExperiencePrompts')"), 'global PWA prompts must be lazy-loaded outside authenticated-only UI')
check(main.includes('<PwaExperiencePrompts />'), 'global PWA prompts must be mounted for landing/auth/workspace routes')
check(landing.includes('const { canInstall, install } = usePwa()'), 'landing navigation must consume genuine installability')
check(landing.includes('canInstall ? <button className="marketing-install-link"'), 'landing menu Install App option must be conditional')
check(landing.includes('>Install App</button>'), 'landing install action must be clearly labelled')
check(!status.includes('BulkText update available.'), 'authenticated status bar must not duplicate the global update prompt')

check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache version must be 0.20.3')
check(sw.includes("event.data?.type === 'SKIP_WAITING'"), 'service worker must support explicit user-approved activation')
check(!/addEventListener\('install'[\s\S]{0,180}skipWaiting\(/.test(sw), 'service worker install must not force activation')
check(styles.includes('.pwa-experience-stack') && styles.includes('.pwa-experience-prompt'), 'global install/update prompt styles required')
check(styles.includes('.marketing-install-link'), 'landing Install App menu styling required')

check(runtimeTest.includes('suppresses the automatic prompt after Not now'), 'runtime coverage must protect dismissal suppression')
check(runtimeTest.includes('hides it after installation is accepted'), 'runtime coverage must protect install completion hiding')
check(runtimeTest.includes('already running in standalone mode'), 'runtime coverage must protect already-installed behavior')
check(runtimeTest.includes('honors Later for the same worker'), 'runtime coverage must protect update deferral')
check(runtimeTest.includes("SKIP_WAITING"), 'runtime coverage must protect explicit update activation')
check(runtimeTest.includes('connectivity returns'), 'runtime coverage must protect background update checking')

check(preflight.includes('test-pwa-install-update0201-source.mjs'), 'preflight must require the 0.20.3 PWA source contract')
check(preflight.includes('PwaExperiencePrompts.tsx'), 'preflight must require the global prompt component')
check(certifier.includes("'test:pwa-install-update-source-0201'"), '0.20.3 certifier must include source contract')
check(certifier.includes("'test:pwa-install-update-0201'"), '0.20.3 certifier must include runtime install/update tests')
check(certifier.includes("'test:bundle-0196'") && certifier.includes("'test:pwa-shell-01810r1'"), '0.20.3 must preserve bundle and offline shell certification')
check(!fs.existsSync('supabase/migrations/20261013002010_pwa_install_update.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 PWA install & update source contract: PASS (${assertions} assertions)`)
