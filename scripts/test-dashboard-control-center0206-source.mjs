import { readFile, readdir } from 'node:fs/promises'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.12 Home Dashboard Control Center source contract failed: ${message}`)
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const dashboard = await readFile(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
const sw = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8')
const observability = await readFile(new URL('../src/lib/observability.ts', import.meta.url), 'utf8')
const tests = await readFile(new URL('../src/test/dashboardControlCenter0206.test.tsx', import.meta.url), 'utf8')
const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url))

check(pkg.version === '0.20.12', 'package version must be 0.20.12')
check(lock.version === '0.20.12' && lock.packages?.['']?.version === '0.20.12', 'package-lock must match 0.20.12')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(sw.includes("const VERSION = '0.20.12'"), 'service-worker cache identity must advance to 0.20.12')
check(observability.includes("OBSERVABILITY_RELEASE = '0.20.12'"), 'observability release marker must advance to 0.20.12')
check(dashboard.includes('Promise.allSettled(['), 'dashboard resources must load with partial-failure isolation')
check(dashboard.includes('listCampaignConfirmations(workspace.id)'), 'dashboard must load recent confirmed campaigns through the existing API')
check(dashboard.includes('data.campaigns.slice(0, 3)'), 'dashboard must cap recent activity to three campaigns in the view')
check(dashboard.includes('Sending setup') && dashboard.includes('Your active route'), 'dashboard must expose one authoritative sending setup module')
check(dashboard.includes('Recent campaigns') && dashboard.includes('View all campaigns'), 'dashboard must expose recent campaign activity')
check(dashboard.includes('Available sections remain usable.'), 'partial-load warning must state that fulfilled modules remain usable')
check(!dashboard.includes('PwaInstallCard'), 'dashboard must not duplicate the global PWA install surface')
check(!dashboard.includes('Current identity'), 'retired Current identity terminology must not return')
check(!dashboard.includes('dashboard-next-action'), 'duplicated Next action module must be removed')
check((dashboard.match(/to="\/campaigns\/new"/g) ?? []).length === 1, 'dashboard must expose exactly one New campaign route action')
check(styles.includes('.dashboard-setup-strip') && styles.includes('.dashboard-utility-grid') && styles.includes('.dashboard-recent-row'), 'responsive dashboard control-center styles must exist')
check(!styles.includes('.dashboard-next-action'), 'retired Next action styling must be removed')
check(tests.includes('keeps fulfilled dashboard modules usable when a sibling resource fails'), 'partial-failure regression test must exist')
check(tests.includes('does not misreport a failed gateway request as an unpaired phone'), 'gateway failure truthfulness regression test must exist')
check(!migrations.some((name) => name.includes('0206') || name.startsWith('20261014')), '0.20.12 must not add a database migration')

console.log(`Web 0.20.12 Home Dashboard Control Center source contract: PASS (${assertions} assertions)`)
