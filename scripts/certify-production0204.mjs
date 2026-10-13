import { spawnSync } from 'node:child_process'
import process from 'node:process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const gates = [
  ['0.20.4 recipient import source contract', npm, ['run', 'test:import-scale-source-0204']],
  ['0.20.4 recipient import runtime regressions', npm, ['run', 'test:import-scale-0204']],
  ['0.20.3-r1 certified production baseline', npm, ['run', 'certify:0203r1']],
]

for (const [label, command, args] of gates) {
  console.log(`\n=== 0.20.4 certification: ${label} ===`)
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

console.log('\nBulkText Web 0.20.4 Recipient Import Reliability & Scale certification: PASS')
console.log('Database gate remains explicit: apply the local migration and run npm run test:import-scale-local-0204 before hosted db push.')
