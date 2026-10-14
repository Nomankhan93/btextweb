import assert from 'node:assert/strict'
import fs from 'node:fs'

let assertions = 0
function check(condition, message) { assertions += 1; assert.ok(condition, message) }

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const css = fs.readFileSync('src/styles/app.css', 'utf8')
const sw = fs.readFileSync('public/service-worker.js', 'utf8')
const shell = fs.readFileSync('src/components/AppShell.tsx', 'utf8')

check(pkg.version === '0.20.5', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(Boolean(pkg.scripts?.['test:pwa-scroll-source-0192']), '0.20.3 source regression script must exist')
check(Boolean(pkg.scripts?.['test:pwa-scroll-0192']), '0.20.3 functional regression script must exist')
check(!css.includes('overscroll-behavior-y: none'), 'standalone mode must not disable vertical overscroll behavior')
check(/html\s*\{[^}]*min-height:\s*100%[^}]*overflow-y:\s*auto/s.test(css), 'html must remain a vertical auto scroll container')
check(/body\s*\{[^}]*min-height:\s*100vh[^}]*overflow-y:\s*auto/s.test(css), 'body must explicitly allow vertical scrolling')
check(/#root\s*\{[^}]*min-height:\s*100vh/s.test(css), 'root must use minimum height rather than fixed viewport height')
check(/@media\s*\(display-mode:\s*standalone\)[\s\S]*html, body\s*\{[\s\S]*overflow-y:\s*auto/s.test(css), 'standalone mode must preserve vertical auto scrolling')
check(/@media\s*\(display-mode:\s*standalone\)[\s\S]*overscroll-behavior-y:\s*auto/s.test(css), 'standalone mode must restore normal vertical overscroll behavior')
check(/body, #root, \.app-shell\s*\{\s*min-height:\s*100dvh/s.test(css), 'standalone roots must use dynamic viewport minimum height')
check(!/\.app-shell\s*\{[^}]*(?:^|[;{])\s*height:\s*100(?:d)?vh/s.test(css), 'app shell must not be fixed to one viewport height')
check(!/body\s*\{[^}]*overflow:\s*hidden/s.test(css), 'body must not globally hide scrolling')
check(!/body\s*\{[^}]*touch-action:\s*none/s.test(css), 'body must not disable touch panning')
check(/\.mobile-bottom-nav\s*\{[\s\S]*position:\s*fixed/s.test(css), 'mobile bottom nav remains fixed')
check(/\.content\s*\{\s*padding:\s*18px 12px calc\(96px \+ env\(safe-area-inset-bottom\)\)/s.test(css), 'mobile content preserves bottom-nav safe-area clearance')
check(/\.mobile-tools-sheet\s*\{[\s\S]*overflow-y:\s*auto/s.test(css), 'Tools sheet keeps bounded internal vertical scrolling')
check(shell.includes('className="mobile-bottom-nav"'), 'AppShell still renders mobile bottom navigation')
check(shell.includes('className="mobile-tools-sheet"'), 'AppShell still renders Tools sheet')
check(sw.includes("const VERSION = '0.20.5'"), 'service-worker cache version must match 0.20.3')

console.log(`Web 0.20.3 installed PWA scroll source contract: PASS (${assertions} assertions)`)
