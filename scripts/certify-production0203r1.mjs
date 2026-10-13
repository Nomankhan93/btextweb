import { spawnSync } from 'node:child_process'
import process from 'node:process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gates = [
  ['0.20.3-r1 routing/PWA source contract', npm, ['run', 'test:routing-pwa-source-0203r1']],
  ['0.20.3-r1 service-worker shell behavior', npm, ['run', 'test:pwa-shell-01810r1']],
  ['0.20.3-r1 update prompt runtime', npm, ['run', 'test:pwa-install-update-0201']],
  ['0.20.3-r1 public/deep-route regression', npm, ['run', 'test:public-root-0191']],
  ['0.20.3 certified baseline regressions', npm, ['run', 'certify:0203']],
]

for (const [label, command, args] of gates) {
  console.log(`\n=== 0.20.3-r1 certification: ${label} ===`)
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

console.log('\nBulkText Web 0.20.3-r1 production routing & controlled PWA update certification: PASS')
console.log('Next: git diff --check, package the patch, deploy, then smoke-test deep-route refresh and explicit Update now on desktop browser + installed mobile PWA.')
