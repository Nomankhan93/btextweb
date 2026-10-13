import { spawnSync } from 'node:child_process'
import process from 'node:process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gates = [
  ['0.20.3 auth mobile polish source contract', npm, ['run', 'test:auth-mobile-polish-source-0203']],
  ['0.20.3 auth mobile polish runtime', npm, ['run', 'test:auth-mobile-polish-0203']],
  ['0.20.2 landing conversion source regression', npm, ['run', 'test:landing-conversion-source-0202']],
  ['0.20.2 landing conversion runtime regression', npm, ['run', 'test:landing-conversion-0202']],
  ['0.20.1 PWA install/update source regression', npm, ['run', 'test:pwa-install-update-source-0201']],
  ['0.20.1 PWA install/update runtime regression', npm, ['run', 'test:pwa-install-update-0201']],
  ['launch source contract', npm, ['run', 'test:launch-source-0200']],
  ['preflight', npm, ['run', 'preflight']],
  ['accessibility/forms', npm, ['run', 'test:accessibility-forms-0199']],
  ['auth/session/workspace', npm, ['run', 'test:auth-boundary-0198']],
  ['observability/privacy', npm, ['run', 'test:observability-0197']],
  ['bootstrap/lazy routing', npm, ['run', 'test:bootstrap-split-0196r1']],
  ['TypeScript', npm, ['run', 'check']],
  ['full Vitest suite', npm, ['run', 'test']],
  ['production build', npm, ['run', 'build']],
  ['bundle budget', npm, ['run', 'test:bundle-0196']],
  ['PWA shell integrity', npm, ['run', 'test:pwa-shell-01810r1']],
]

for (const [label, command, args] of gates) {
  console.log(`\n=== 0.20.3 certification: ${label} ===`)
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env })
  if (result.error) {
    console.error(`Certification failed to start ${label}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`Certification failed at ${label} (exit ${result.status ?? 'unknown'}).`)
    process.exit(result.status || 1)
  }
}

console.log('\nBulkText Web 0.20.3 automated production certification: PASS')
console.log('Next: git diff --check && ./scripts/release-package.sh, then verify sign-in/signup on deployed mobile Chrome at 320/360/390/412 widths with the keyboard open.')
