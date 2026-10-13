import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(file, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const vercel = JSON.parse(read('vercel.json'))
const sw = read('public/service-worker.js')
const provider = read('src/pwa/PwaProvider.tsx')
const prompts = read('src/components/PwaExperiencePrompts.tsx')
const shellTest = read('scripts/test-pwa-shell01810r1.mjs')
const runtimeTest = read('src/test/pwaInstallUpdate0201.test.tsx')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.3-r1', 'frontend version must be 0.20.3-r1')
check(lock.version === '0.20.3-r1' && lock.packages?.['']?.version === '0.20.3-r1', 'package-lock must match 0.20.3-r1')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(Array.isArray(vercel.rewrites) && vercel.rewrites.length === 1, 'Vercel must define exactly one SPA fallback rewrite')
check(vercel.rewrites[0]?.source === '/(.*)', 'Vercel SPA rewrite must cover deep routes')
check(vercel.rewrites[0]?.destination === '/index.html', 'Vercel SPA rewrite must serve index.html for deep routes')

check(sw.includes("const VERSION = '0.20.3-r1'"), 'service-worker cache identity must advance to 0.20.3-r1')
check(sw.includes('async function installedShellNavigation(request)'), 'navigation must use the installed-shell strategy')
check(sw.includes('if (installedShell) return installedShell'), 'active controlled clients must remain pinned to their installed shell')
check(!sw.includes('async function networkFirstNavigation(request)'), 'network-first app navigation must be removed')
check(sw.includes('if (networkResponse.ok) return networkResponse'), 'damaged-shell recovery may accept only successful network navigation')
check(sw.includes("event.data?.type === 'SKIP_WAITING'"), 'waiting worker must activate only after explicit SKIP_WAITING')
check(!/addEventListener\('install'[\s\S]{0,180}skipWaiting\(/.test(sw), 'install must never force waiting-worker activation')

check(provider.includes('waitingWorkerRef.current !== worker'), 'Later must remain respected for the same waiting worker')
check(provider.includes("waitingWorker.postMessage({ type: 'SKIP_WAITING' })"), 'Update now must request activation explicitly')
check(provider.includes('reloadForUpdate.current = true'), 'explicit update must arm one controlled reload')
check(provider.includes("window.location.reload()"), 'controller change after explicit update must reload the page')
check(prompts.includes("updating ? 'Updating…' : 'Update now'"), 'Update now must show visible applying feedback')
check(prompts.includes('disabled={updating}'), 'update actions must prevent duplicate activation while applying')

check(shellTest.includes('controlled online navigation must keep the installed versioned shell'), 'shell harness must protect version pinning')
check(shellTest.includes('host 404 fallback must not expose the hosting provider 404 page'), 'shell harness must protect 404 fallback behavior')
check(shellTest.includes('network failure must retain offline navigation recovery'), 'shell harness must protect offline recovery')
check(runtimeTest.includes("name: 'Updating…'"), 'runtime test must protect visible update progress')
check(runtimeTest.includes("toHaveBeenCalledWith({ type: 'SKIP_WAITING' })"), 'runtime test must protect explicit activation message')

const migrations = fs.readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'))
check(!migrations.some((name) => name.includes('0203') || name.includes('0204')), '0.20.3-r1 must not add a database migration')

console.log(`Web 0.20.3-r1 production routing & controlled PWA update source contract: PASS (${assertions} assertions)`)
