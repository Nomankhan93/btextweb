import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const preflight = read('scripts/preflight.mjs')
const certifier = read('scripts/certify-production0200.mjs')
const releasePackager = read('scripts/release-package.py')
const serviceWorker = read('public/service-worker.js')
const observability = read('src/lib/observability.ts')
const launchDoc = read('docs/PRODUCTION_LAUNCH_BASELINE_0200.md')
const validation = read('VALIDATION_0_20_0.md')
const changedFiles = read('CHANGED_FILES_0_20_0.txt').trim().split('\n')

let assertions = 0
function check(condition, message) {
  assertions += 1
  assert.ok(condition, message)
}

check(pkg.version === '0.20.5', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.5' && lock.packages?.['']?.version === '0.20.5', 'package-lock must match 0.20.3')
check(pkg.scripts?.['test:launch-source-0200'] === 'node scripts/test-production-launch0200-source.mjs', 'launch source contract command must exist')
check(pkg.scripts?.['certify:0200'] === 'node scripts/certify-production0200.mjs', 'single launch certification command must exist')
check(changedFiles.includes('CHANGED_FILES_0_20_0.txt') && changedFiles.includes('SHA256SUMS.txt'), 'launch changed-file manifest must include itself and the checksum manifest')
check(changedFiles.includes('scripts/certify-production0200.mjs') && changedFiles.includes('docs/PRODUCTION_LAUNCH_BASELINE_0200.md'), 'launch changed-file manifest must include certification code and launch documentation')

for (const command of [
  'test:launch-source-0200',
  'preflight',
  'test:accessibility-forms-0199',
  'test:auth-boundary-0198',
  'test:observability-0197',
  'test:bootstrap-split-0196r1',
  'check',
  'test',
  'build',
  'test:bundle-0196',
  'test:pwa-shell-01810r1',
]) {
  check(certifier.includes(`'${command}'`), `certifier must include ${command}`)
}
check(certifier.includes('process.exit'), 'certifier must fail closed when any gate fails')
check(certifier.includes('automated production certification: PASS'), 'certifier must emit an unambiguous PASS marker only after all gates')

check(preflight.includes("packageJson.version !== '0.20.5'"), 'preflight must enforce frontend 0.20.3')
check(preflight.includes('test-production-launch0200-source.mjs'), 'preflight must require the 0.20.3 launch source contract')
check(preflight.includes('certify-production0200.mjs'), 'preflight must require the certification orchestrator')
check(preflight.includes('PRODUCTION_LAUNCH_BASELINE_0200.md'), 'preflight must require launch documentation')
check(preflight.includes('0.20.3 production launch certification markers'), 'preflight must enforce launch certification markers')
check(serviceWorker.includes("const VERSION = '0.20.5'"), 'service worker cache version must be 0.20.3')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.5'"), 'diagnostic release marker must be 0.20.3')

for (const marker of [
  "run_preflight(root, 'SOURCE')",
  "run_preflight(stage, 'STAGE')",
  'verify_zip_layout(zip_path, release_root_name)',
  'verify_extracted_release(zip_path, release_root_name)',
  'scan_stage_content(stage)',
  'scan_zip(zip_path)',
]) {
  check(releasePackager.includes(marker), `release packager must preserve ${marker}`)
}

for (const marker of [
  'initial static JS budget remains `< 500 KiB`',
  'every emitted JS chunk remains `< 500,000 bytes`',
  'Post-deploy launch checklist',
  'paired Android gateway appears in Phone & SIM',
  'one controlled test message uses the explicitly selected SIM',
]) {
  check(launchDoc.includes(marker), `launch baseline must document: ${marker}`)
}
check(validation.includes('npm run certify:0200'), 'validation must use the consolidated launch certification command')
check(validation.includes('./scripts/release-package.sh'), 'validation must require deterministic release packaging')
check(validation.includes('does not replace deployed-browser or physical Android gateway smoke'), 'validation must not overclaim deployment/device certification')
check(!fs.existsSync('supabase/migrations/20261013002000_production_launch.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 production launch source contract: PASS (${assertions} assertions)`)
