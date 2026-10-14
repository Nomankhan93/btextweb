import { spawnSync } from 'node:child_process'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
for (const args of [
  ['run', 'test:campaign-delivery-source-02010'],
  ['run', 'test:campaign-message-review-source-0209'],
  ['run', 'test:campaign-wizard-source-0208'],
  ['run', 'test:campaign-send-safety-source-0207'],
  ['run', 'preflight'],
  ['run', 'check'],
  ['run', 'test:campaign-delivery-02010'],
  ['run', 'test:campaign-send-safety-0207'],
  ['test'],
  ['run', 'build'],
]) {
  const result = spawnSync(npm, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log('BulkText Web 0.20.12 certification PASS. No new database migration or Android change.')
