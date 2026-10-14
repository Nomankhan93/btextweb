import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
for (const name of readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('-source.mjs')).sort()) {
  run(process.execPath, ['scripts/' + name])
}
for (const args of [['run','preflight'],['run','check'],['test','--','--maxWorkers=2'],['run','build'],['run','test:pwa-shell-01810r1']]) run(npm, args)
console.log('BulkText Web 0.20.12 certification PASS. Backend contract 0.18.5; no new migration or Android change.')
