import fs from 'node:fs'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.3 safe error presentation source contract failed: ${message}`)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const errors = fs.readFileSync('src/lib/errors.ts', 'utf8')
const tests = fs.readFileSync('src/test/errors.test.ts', 'utf8')
const preflight = fs.readFileSync('scripts/preflight.mjs', 'utf8')
const serviceWorker = fs.readFileSync('public/service-worker.js', 'utf8')

check(pkg.version === '0.20.5', 'frontend version must be 0.20.3')
check(pkg.bulktext?.backendContractVersion === '0.18.5', 'backend contract must remain 0.18.5')
check(lock.version === '0.20.5' && lock.packages?.['']?.version === '0.20.5', 'package-lock release version must match package.json')
check(Boolean(pkg.scripts?.['test:error-presentation-source-0195']), 'source contract command must exist')
check(Boolean(pkg.scripts?.['test:error-presentation-0195']), 'focused Vitest command must exist')
check(errors.includes('errorDiagnosticContext'), 'raw diagnostics must remain available through a dedicated helper')
check(errors.includes('details: nonEmptyText(candidate.details)'), 'diagnostic helper must retain backend details')
check(errors.includes('hint: nonEmptyText(candidate.hint)'), 'diagnostic helper must retain backend hints')
check(errors.includes('code: nonEmptyText(candidate.code)'), 'diagnostic helper must retain backend codes')
check(errors.includes('safeDisplayMessage'), 'user-facing error text must pass through the safe display policy')
check(errors.includes('NETWORK_MARKERS'), 'network failures must be classified')
check(errors.includes('AUTH_MARKERS'), 'authentication failures must be classified')
check(errors.includes('PERMISSION_MARKERS'), 'permission failures must be classified')
check(errors.includes('INTERNAL_MARKERS'), 'internal backend failures must be classified')
check(errors.includes('Could not reach BulkText. Check your internet connection and try again.'), 'network copy must be stable and actionable')
check(errors.includes('Authentication required. Sign in again and retry.'), 'authentication copy must be stable and actionable')
check(errors.includes('You do not have permission to perform this action.'), 'permission copy must be stable and non-technical')
check(!errors.includes("parts.push(details)"), 'details must no longer be appended to display text')
check(!errors.includes('`Hint: ${hint}`'), 'backend hints must no longer be appended to display text')
check(!errors.includes('`[${code}]`'), 'backend codes must no longer be appended to display text')
check(tests.includes('does not expose PostgREST details, hints, codes or table names'), 'diagnostic leakage regression must be covered')
check(tests.includes('preserves safe backend validation messages without appending diagnostics'), 'safe backend validation regression must be covered')
check(tests.includes('normalizes network failures into actionable product copy'), 'network regression must be covered')
check(tests.includes('normalizes expired authentication failures'), 'authentication regression must be covered')
check(tests.includes('falls back instead of surfacing internal SQL/schema failures'), 'SQL/internal fallback regression must be covered')
check(tests.includes('keeps raw backend diagnostics available separately from user-facing copy'), 'diagnostic separation regression must be covered')
check(preflight.includes('test-error-presentation0195-source.mjs'), 'preflight must require the 0.20.3 source contract')
check(serviceWorker.includes("const VERSION = '0.20.5'"), 'service-worker cache marker must match 0.20.3')
check(!fs.existsSync('supabase/migrations/20261012001950_safe_error_presentation.sql'), '0.20.3 must not add a database migration')

console.log(`Web 0.20.3 safe error presentation source contract: PASS (${assertions} assertions)`)
