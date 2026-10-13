import fs from 'node:fs'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.2 mobile dialog focus source contract failed: ${message}`)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const shell = fs.readFileSync('src/components/AppShell.tsx', 'utf8')
const test = fs.readFileSync('src/test/mobileDialogFocus0194.test.tsx', 'utf8')
const serviceWorker = fs.readFileSync('public/service-worker.js', 'utf8')

check(pkg.version === '0.20.2', 'frontend version must be 0.20.2')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.2' && lock.packages?.['']?.version === '0.20.2', 'package-lock release version must match package.json')
check(Boolean(pkg.scripts?.['test:mobile-dialog-focus-source-0194']), 'source contract command must exist')
check(Boolean(pkg.scripts?.['test:mobile-dialog-focus-0194']), 'functional accessibility regression command must exist')
check(shell.includes('useRef'), 'AppShell must use stable dialog/trigger refs')
check(shell.includes('toolsDialogRef'), 'AppShell must keep a dialog ref')
check(shell.includes('toolsTriggerRef'), 'AppShell must keep a Tools trigger ref')
check(shell.includes('focusable[0]?.focus()'), 'opening the dialog must move focus inside')
check(shell.includes("event.key !== 'Tab'"), 'dialog keyboard handling must include Tab focus trapping')
check(shell.includes('last.focus()'), 'Shift+Tab must wrap to the final dialog control')
check(shell.includes('first.focus()'), 'Tab must wrap to the first dialog control')
check(shell.includes("event.key === 'Escape'"), 'Escape dismissal must remain supported')
check(shell.includes('trigger?.isConnected') && shell.includes('trigger.focus()'), 'closing must restore focus to the trigger safely')
check(shell.includes('tabIndex={-1}') && shell.includes('aria-label="Dismiss tools"'), 'backdrop must stay pointer-dismissible but outside the tab order')
check(shell.includes('role="dialog"') && shell.includes('aria-modal="true"'), 'existing modal dialog semantics must remain')
check(shell.includes('aria-labelledby="mobile-tools-title"'), 'dialog accessible name wiring must remain')
check(test.includes('moves focus into the Tools dialog'), 'initial focus regression must be covered')
check(test.includes('wraps Tab and Shift+Tab'), 'both focus-wrap directions must be covered')
check(test.includes('restores focus to the Tools trigger after Escape'), 'Escape focus restoration must be covered')
check(test.includes('preserves secondary navigation'), 'navigation-close regression must be covered')
check(serviceWorker.includes("const VERSION = '0.20.2'"), 'service-worker cache marker must match 0.20.2')
check(!fs.existsSync('supabase/migrations/20261012001940_mobile_dialog_focus.sql'), '0.20.2 must not add a database migration')

console.log(`Web 0.20.2 mobile dialog focus source contract: PASS (${assertions} assertions)`)
