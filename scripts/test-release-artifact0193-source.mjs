import fs from 'node:fs'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.3 source contract failed: ${message}`)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const envExample = fs.readFileSync('.env.example', 'utf8')
const preflight = fs.readFileSync('scripts/preflight.mjs', 'utf8')
const packager = fs.readFileSync('scripts/release-package.py', 'utf8')
const gitignore = fs.readFileSync('.gitignore', 'utf8')
const serviceWorker = fs.readFileSync('public/service-worker.js', 'utf8')

check(pkg.version === '0.20.3-r1', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.3-r1' && lock.packages?.['']?.version === '0.20.3-r1', 'package-lock release version must match package.json')
check(Boolean(pkg.scripts?.['test:release-artifact-source-0193']), 'release-integrity source test command must exist')
check(envExample.includes('VITE_SUPABASE_URL=https://your-project.supabase.co'), '.env.example must contain URL placeholder')
check(envExample.includes('VITE_SUPABASE_ANON_KEY=your-anon-key'), '.env.example must contain anon-key placeholder')
check(!/service[_-]?role|jwt[_-]?secret|sb_secret_/i.test(envExample), '.env.example must not contain privileged secret material')
check(preflight.includes("packageJson.version !== '0.20.3-r1'"), 'preflight must enforce frontend 0.20.3')
check(preflight.includes('.env.example placeholder contract missing'), 'preflight must validate the environment template')
check(preflight.includes('test-release-artifact0193-source.mjs'), 'preflight must require the 0.20.3 release test')
check(preflight.includes('requiredPackagerMarkers') && preflight.includes('verify_extracted_release(zip_path, release_root_name)'), 'preflight must guard release-packager hardening markers')
check(packager.includes("run_preflight(root, 'SOURCE')"), 'release packager must preflight the source tree')
check(packager.includes("run_preflight(stage, 'STAGE')"), 'release packager must preflight the staged source tree')
check(packager.includes('verify_zip_layout(zip_path, release_root_name)'), 'release packager must verify the versioned ZIP root')
check(packager.includes('verify_extracted_release(zip_path, release_root_name)'), 'release packager must verify the extracted ZIP')
check(packager.includes('verify_manifest(extracted)'), 'release packager must verify extracted SHA256SUMS')
check(packager.includes("'.patch-backups'"), 'release packager must exclude patch backups')
check(packager.includes("fnmatch.fnmatch(name, 'config.toml.before-*')"), 'release packager must exclude Supabase config backups')
check(packager.includes("release_root_name = f'bulktext-web-{version}'"), 'release root name must be version-derived')
check(packager.includes('deterministic_zip(stage, zip_path, release_root_name)'), 'ZIP prefix must stay version-derived even with a custom stage directory')
check(packager.includes("zip_path = output_dir / f'{release_root_name}-source.zip'"), 'release ZIP name must be version-derived')
check(gitignore.includes('.patch-backups/'), 'patch backup directory must remain gitignored')
check(gitignore.includes('supabase/config.toml.before-*'), 'Supabase config backups must remain gitignored')
check(serviceWorker.includes("const VERSION = '0.20.3-r1'"), 'service-worker cache marker must match 0.20.3')
check(!fs.existsSync('supabase/migrations/20261012001930_release_artifact_integrity.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 release artifact integrity source contract: PASS (${assertions} assertions)`)
