import fs from 'node:fs'
import process from 'node:process'

let assertions = 0
function check(condition, message) {
  assertions += 1
  if (!condition) throw new Error(`0.20.4 recipient import scale source contract failed: ${message}`)
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const importFiles = fs.readFileSync('src/lib/importFiles.ts', 'utf8')
const importsApi = fs.readFileSync('src/lib/importsApi.ts', 'utf8')
const importsPage = fs.readFileSync('src/pages/ImportsPage.tsx', 'utf8')
const campaignPage = fs.readFileSync('src/pages/SimpleCampaignPage.tsx', 'utf8')
const pagedRpc = fs.readFileSync('src/lib/pagedRpc.ts', 'utf8')
const draftStorage = fs.readFileSync('src/lib/campaignDraftStorage.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20261013000100_recipient_import_reliability_scale.sql', 'utf8')
const preflight = fs.readFileSync('scripts/preflight.mjs', 'utf8')
const sw = fs.readFileSync('public/service-worker.js', 'utf8')

check(pkg.version === '0.20.4', 'package version must be 0.20.4')
check(lock.version === '0.20.4' && lock.packages?.['']?.version === '0.20.4', 'package-lock version must match 0.20.4')
check(sw.includes("const VERSION = '0.20.4'"), 'service-worker cache identity must advance to 0.20.4')

check(!importFiles.includes('MAX_IMPORT_FILE_BYTES'), 'the 5 MB browser product cap must be removed')
check(!importFiles.includes('MAX_IMPORT_ROWS'), 'the 5,000-row parser product cap must be removed')
check(importFiles.includes('truncated: false'), 'parsed imports must not be silently truncated')
check(importFiles.includes('inflateRawFallback'), 'XLSX must have a browser-independent raw-DEFLATE fallback')
check(importFiles.includes("new DecompressionStream('deflate-raw')"), 'XLSX should retain native decompression when supported')
check(importFiles.includes("phase: 'reading' | 'hashing' | 'parsing'"), 'file parsing progress contract must exist')
check(importFiles.includes('signal?: AbortSignal'), 'file parsing must support cancellation')
check(importFiles.includes("extension !== 'csv' && extension !== 'xlsx'"), 'file parser must accept both CSV and XLSX extensions')
check(importsPage.includes('accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'), 'Imports file chooser must accept modern XLSX')
check(campaignPage.includes('accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"'), 'campaign file chooser must accept modern XLSX')

check(importsApi.includes('CONTACT_IMPORT_BATCH_ROWS = 250'), 'database staging must use bounded row batches')
for (const rpc of ['begin_contact_import', 'append_contact_import_rows', 'finalize_contact_import', 'abort_contact_import']) {
  check(importsApi.includes(`'${rpc}'`), `web import API must call ${rpc}`)
  check(migration.includes(`function public.${rpc}`), `migration must define ${rpc}`)
}
check(migration.includes("status in ('staging', 'staged')"), 'database must distinguish incomplete staging sessions')
check(migration.includes("and i.status = 'staged'"), 'history/preview-facing imports must expose finalized sessions only')
check(migration.includes("using (public.is_org_member(organization_id) and status = 'staged')"), 'direct contact-import reads must hide staging sessions')
check(migration.includes('create policy \"contact_import_rows_select_members\"') && migration.includes("and i.status = 'staged'"), 'direct import-row reads must hide rows from staging sessions')
check(migration.includes('function public.enforce_finalized_import_for_recipient_preview()') && migration.includes('returns trigger\nlanguage plpgsql\nsecurity definer'), 'preview finalization trigger must execute with a fixed privileged boundary')
check(migration.includes('idempotent retry after a lost client response'), 'batch append must protect idempotent retries')
check(migration.includes('row_number() over (partition by r.normalized_e164'), 'duplicate flags must be finalized deterministically across batches')
check(migration.includes("'import_fixed_file_size_cap', false"), 'schema metadata must retire the fixed file-size cap')
check(migration.includes("'import_fixed_row_cap', false"), 'schema metadata must retire the fixed row cap')
check(!migration.includes('p_source_size_bytes > 5242880'), 'new import migration must not restore the 5 MB cap')
check(!migration.includes('jsonb_array_length(p_rows) > 5000'), 'compatibility import RPC must not restore the 5,000-row cap')

check(!importsPage.includes('max 5 MB'), 'Imports UI must not advertise the retired 5 MB cap')
check(!importsPage.includes('MAX_IMPORT_ROWS'), 'Imports UI must not gate on the old row cap')
check(importsPage.includes('import-work-progress'), 'Imports UI must expose large-file progress')
check(importsPage.includes('cancelCurrentWork'), 'Imports UI must expose cancellation')
check(!campaignPage.includes('max 5 MB'), 'New campaign UI must not advertise the retired file cap')
check(!campaignPage.includes('MAX_IMPORT_ROWS'), 'New campaign UI must not gate on the old row cap')
check(campaignPage.includes('import-work-progress'), 'New campaign must expose import progress')

check(!pagedRpc.includes('MAX_RECIPIENT_ROWS'), 'recipient pagination must not retain a default 5,000-row ceiling')
check(pagedRpc.includes('maxRows?: number'), 'callers may still opt into an explicit technical safety ceiling')
check(!draftStorage.includes('value.rows.length > 5000'), 'offline draft validation must accept imports above 5,000 rows')
check(!draftStorage.includes('value.length > 5000'), 'personalization draft validation must accept above 5,000 rows')

check(preflight.includes('test-import-scale0204-source.mjs'), 'preflight must require the 0.20.4 source contract')
check(preflight.includes('20261013000100_recipient_import_reliability_scale.sql'), 'preflight must require the 0.20.4 migration')

console.log(`Web 0.20.4 recipient import reliability & scale source contract: PASS (${assertions} assertions)`)
