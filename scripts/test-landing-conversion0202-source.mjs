import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const landing = read('src/pages/LandingPage.tsx')
const css = read('src/styles/app.css')
const serviceWorker = read('public/service-worker.js')
const preflight = read('scripts/preflight.mjs')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.3-r1', 'frontend version must be 0.20.3')
check(lock.version === '0.20.3-r1' && lock.packages?.['']?.version === '0.20.3-r1', 'package-lock release version must match package.json')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain pinned to 0.18.5')
check(Boolean(pkg.scripts?.['test:landing-conversion-source-0202']), '0.20.3 landing source contract script must exist')
check(Boolean(pkg.scripts?.['test:landing-conversion-0202']), '0.20.3 landing runtime script must exist')
check(Boolean(pkg.scripts?.['certify:0202']), '0.20.3 certification script must exist')

check(landing.includes('Business SMS, sent from your own SIM.'), 'single dominant hero message required')
check(landing.includes('Create campaigns on the web and send through your paired Android phone using the exact SIM you choose.'), 'compact hero supporting copy required')
check(landing.includes('Own SIM') && landing.includes('Exact routing') && landing.includes('Live delivery status'), 'compact hero trust row required')
check(landing.indexOf('dashboard-showcase') < landing.indexOf('id="how-it-works"'), 'product proof must appear before explanatory workflow sections')
check(landing.includes('Campaign delivery progress'), 'dashboard preview must tell one campaign progress story')
check(landing.includes('Recipients') && landing.includes('1,284') && landing.includes('Sent') && landing.includes('1,271') && landing.includes('Delivered') && landing.includes('1,243'), 'dashboard proof metrics required')
check(landing.includes('SIM 1 · Online'), 'dashboard proof must include gateway/SIM online state')
check(!landing.includes('Needs review'), 'dashboard proof must avoid unrelated metric clutter')
check(!landing.includes('See the sending workflow without digging through technical screens'), 'separate product-visibility section must be removed')

check(landing.includes('Connect your phone') && landing.includes('Build your campaign') && landing.includes('Select the exact SIM') && landing.includes('Track delivery'), 'compact four-step workflow required')
check(landing.includes('feature-card-copy'), 'features must use compact icon-plus-copy layout')
check(landing.includes('comparison-grid') && landing.includes('Infrastructure') && landing.includes('Gateway cost model') && landing.includes('Routing control'), 'three-differentiator comparison required')
check(!landing.includes('Provider-specific delivery model'), 'delivery-model comparison row must be removed')
check(landing.includes('Turn your Android phone into your SMS gateway'), 'Android gateway differentiator must remain prominent')
check(landing.includes('BulkText Web to secure cloud queue to Android Gateway to SIM 1 or SIM 2'), 'gateway flow accessible label required')
check(landing.includes('Delivery evidence depends on device and network callbacks'), 'delivery evidence caveat must remain visible')

check(landing.includes('aria-expanded={isOpen}') && landing.includes('aria-controls={panelId}') && landing.includes('role="region"'), 'FAQ must use explicit accessible accordion state')
check(landing.includes("event.key !== 'Escape'") && landing.includes('menuButtonRef.current?.focus()'), 'mobile menu Escape close and focus return required')
check(landing.includes("document.body.style.overflow = 'hidden'"), 'mobile navigation must prevent background scroll while open')
check(landing.includes('marketing-menu-backdrop'), 'mobile navigation outside-click dismissal surface required')
check(landing.includes('Install App') && landing.includes('canInstall'), '0.20.3 conditional Install App option must remain available')
check(landing.includes('await install()'), '0.20.3 install action must remain delegated to the PWA provider')

check(css.includes('/* 0.20.2 — Landing page conversion and mobile UX */'), '0.20.3 landing CSS section required')
check(css.includes('overflow-x: clip'), 'landing surface must guard against narrow-screen horizontal overflow')
check(css.includes('font-size: clamp(2.5rem,11vw,2.75rem)'), 'mobile hero typography must stay within the approved compact range')
check(css.includes('@media (max-width: 360px)'), '320-360px narrow-screen guard required')
check(css.includes('min-height: 48px') && css.includes('min-height: 56px'), 'minimum interactive target sizing must remain explicit')
check(css.includes(':focus-visible'), 'visible keyboard focus styling required')
check(css.includes("content: '↓'"), 'mobile Android architecture flow must become vertical')
check(css.includes("color: #cbd9e6 !important"), 'dark gateway supporting text contrast correction required')
check(!css.includes('@keyframes marketing'), 'landing patch must not add ornamental marketing animations')

check(serviceWorker.includes("const VERSION = '0.20.3-r1'"), 'service-worker cache version must advance to 0.20.3')
check(preflight.includes('test-landing-conversion0202-source.mjs'), 'preflight must require the 0.20.3 landing contract')
check(!landing.includes('Pricing') && !landing.includes('Start Free'), 'unlaunched pricing/free-tier claims must remain absent')
check(landing.includes('No third-party gateway fee') && landing.includes('carrier balance or bundle'), 'cost wording must remain scoped and disclose carrier cost')
check(!fs.existsSync('supabase/migrations/20261013002020_landing_conversion_mobile_ux.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 landing conversion & mobile UX source contract: PASS (${assertions} assertions)`)
