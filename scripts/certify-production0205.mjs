import { spawnSync } from 'node:child_process'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
for (const args of [['run', 'preflight'], ['run', 'check'], ['test'], ['run', 'build']]) {
  const result = spawnSync(npm, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log('BulkText Web 0.20.12 certification PASS. No new database migration or Android change.')
