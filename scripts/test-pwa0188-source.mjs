import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
let assertions = 0
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8') }
function assert(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`PWA 0.18.8 source contract failed: ${message}`)
}
function pngSize(file) {
  const buffer = fs.readFileSync(path.join(root, file))
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${file} is not a PNG`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

const pkg = JSON.parse(read('package.json'))
const manifest = JSON.parse(read('public/manifest.webmanifest'))
const index = read('index.html')
const sw = read('public/service-worker.js')
const provider = read('src/pwa/PwaProvider.tsx')
const register = read('src/pwa/registerServiceWorker.ts')
const shell = read('src/components/AppShell.tsx')
const styles = read('src/styles/app.css')
const detail = read('src/pages/CampaignDetailPage.tsx')
const confirmation = read('src/pages/CampaignConfirmationPage.tsx')
const devices = read('src/pages/DevicesPage.tsx')
const mobileNav = read('src/components/AppShell.tsx')

assert(pkg.version === '0.20.2', 'frontend version must be 0.20.2 while preserving the 0.18.8 PWA contract')
assert(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain pinned to 0.18.5')
assert(pkg.scripts?.['test:pwa-0188'], 'targeted PWA test script must exist')
assert(manifest.name === 'BulkText' && manifest.short_name === 'BulkText', 'manifest app names must be BulkText')
assert(manifest.display === 'standalone' && manifest.start_url === '/' && manifest.scope === '/', 'manifest standalone/start/scope contract')
assert(manifest.icons?.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'), '192 any icon required')
assert(manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'), '512 any icon required')
assert(manifest.icons?.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'), '512 maskable icon required')
assert(pngSize('public/icons/icon-192.png').width === 192 && pngSize('public/icons/icon-192.png').height === 192, '192 icon dimensions')
assert(pngSize('public/icons/icon-512.png').width === 512 && pngSize('public/icons/icon-512.png').height === 512, '512 icon dimensions')
assert(pngSize('public/apple-touch-icon.png').width === 180 && pngSize('public/apple-touch-icon.png').height === 180, 'Apple touch icon dimensions')
assert(index.includes('rel="manifest" href="/manifest.webmanifest"'), 'index must link manifest')
assert(index.includes('rel="apple-touch-icon"'), 'index must link Apple touch icon')
assert(index.includes('favicon-32x32.png') && index.includes('favicon.ico'), 'index must link favicons')
assert(sw.includes("const VERSION = '0.20.2'"), 'service worker cache version must match 0.20.2')
assert(sw.includes("if (request.method !== 'GET') return"), 'service worker must never cache mutations')
assert(sw.includes('if (url.origin !== self.location.origin) return'), 'service worker must ignore cross-origin API/auth requests')
assert(sw.includes("request.mode === 'navigate'"), 'service worker navigation fallback required')
assert(sw.includes("event.data?.type === 'SKIP_WAITING'"), 'updates activate only by explicit message')
assert(!/install[\s\S]{0,300}skipWaiting\(/.test(sw), 'install must not force skipWaiting/reload')
assert(!sw.includes("addEventListener('sync'"), 'background sync/offline send queue must not be introduced')
assert(register.includes('!import.meta.env.PROD'), 'service worker registration must be production-only')
assert(provider.includes("beforeinstallprompt") && provider.includes('appinstalled'), 'install lifecycle events required')
assert(provider.includes("window.addEventListener('offline'") && provider.includes("window.addEventListener('online'"), 'online/offline awareness required')
assert(shell.includes('<PwaStatusRegion />'), 'authenticated shell must surface PWA status')
assert(styles.includes('.pwa-offline-banner') && styles.includes('.pwa-install-card'), 'PWA UI styles required')
assert(detail.includes('Offline safety mode.') && detail.includes('disabled={!online || safetyBusy || !loaded}'), 'send screen must disable primary sending offline')
assert(confirmation.includes('Reconnect to confirm.') && confirmation.includes('disabled={!online || !readiness.ready || busy}'), 'campaign confirmation must be blocked offline')
assert(devices.includes('Pairing, SIM selection, disconnect and live refresh are disabled') && devices.includes('disabled={!online || fetching || busy}'), 'Phone & SIM mutations must be blocked offline')
assert(mobileNav.includes('mobile-bottom-nav') && mobileNav.includes('More BulkText tools'), '0.18.7-r2 bottom navigation must be preserved')
assert(fs.existsSync(path.join(root, 'public/offline.html')), 'offline fallback file required')
assert(fs.existsSync(path.join(root, 'public/branding/bulktext-logo.png')), 'BulkText branding asset required')

console.log(`Web 0.18.8 PWA source contract: PASS (${assertions} assertions)`)
