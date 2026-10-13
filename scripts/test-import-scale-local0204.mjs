import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ROW_COUNT = 5201
const BATCH_SIZE = 250

function parseEnv(text) {
  const result = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    result[match[1]] = value
  }
  return result
}
function discoverLocalSupabase() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  return parseEnv(execFileSync(npx, ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}
function required(value, label) { if (!value) throw new Error(`${label} was not found. Start local Supabase first.`); return value }
function assert(condition, message) { if (!condition) throw new Error(message) }
function data(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} ${result.error.code ?? ''}`.trim())
  return result.data
}

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing non-local target ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const email = `bulktext-import-scale-${stamp}@example.test`
const password = `BulkText-${stamp}-Aa1!`
let userId = null
let organizationId = null

function row(index) {
  const phone = index === ROW_COUNT - 1 ? '03000000000' : `0300${String(index).padStart(7, '0')}`
  return {
    sourceRowNumber: index + 2,
    rawData: { Name: `Recipient ${index + 1}`, Mobile: phone },
    rawPhone: phone,
    firstName: `Recipient ${index + 1}`,
    lastName: null,
    displayName: `Recipient ${index + 1}`,
    customFields: {},
  }
}

try {
  console.log('BulkText Web 0.20.4 local recipient import scale acceptance')
  console.log(`Target: ${parsedUrl.origin}`)
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Import Scale Test' } })
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create test user')
  userId = created.data.user.id
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error
  const workspaceRows = data(await client.rpc('get_my_personal_workspace'), 'load personal workspace')
  organizationId = workspaceRows?.[0]?.workspace_id
  assert(typeof organizationId === 'string', 'Personal workspace was not created')

  const sourceSize = 12 * 1024 * 1024
  const importId = data(await client.rpc('begin_contact_import', {
    p_organization_id: organizationId,
    p_source_filename: 'large-recipients.xlsx',
    p_source_type: 'xlsx',
    p_source_size_bytes: sourceSize,
    p_source_sha256: 'a'.repeat(64),
    p_sheet_name: 'Recipients',
    p_headers: ['Name', 'Mobile'],
    p_column_mapping: { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' },
  }), 'begin large import')
  assert(typeof importId === 'string', 'begin_contact_import returned no id')
  console.log('✓ source metadata above the former 5 MB cap is accepted')

  for (let offset = 0; offset < ROW_COUNT; offset += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, ROW_COUNT - offset) }, (_, index) => row(offset + index))
    data(await client.rpc('append_contact_import_rows', {
      p_organization_id: organizationId,
      p_import_id: importId,
      p_rows: batch,
    }), `append rows ${offset + 1}-${offset + batch.length}`)
    if (offset === 0) {
      data(await client.rpc('append_contact_import_rows', {
        p_organization_id: organizationId,
        p_import_id: importId,
        p_rows: batch,
      }), 'retry first batch idempotently')
    }
  }
  const hidden = data(await client.rpc('list_contact_imports', { p_organization_id: organizationId }), 'list imports before finalize')
  assert(!hidden.some((item) => item.import_id === importId), 'Incomplete staging session leaked into import history')
  const directHidden = data(await client.from('contact_imports').select('id').eq('id', importId), 'direct import read before finalize')
  assert(directHidden.length === 0, 'RLS exposed an incomplete contact import directly')
  const directRowsHidden = data(await client.from('contact_import_rows').select('id').eq('import_id', importId).limit(1), 'direct import-row read before finalize')
  assert(directRowsHidden.length === 0, 'RLS exposed incomplete contact import rows directly')
  console.log('✓ 5,201 rows stage in bounded batches; a repeated batch is idempotent and incomplete rows/history stay hidden')

  data(await client.rpc('finalize_contact_import', {
    p_organization_id: organizationId,
    p_import_id: importId,
    p_expected_total_rows: ROW_COUNT,
  }), 'finalize import')
  data(await client.rpc('finalize_contact_import', {
    p_organization_id: organizationId,
    p_import_id: importId,
    p_expected_total_rows: ROW_COUNT,
  }), 'retry finalize idempotently')

  const summary = data(await admin.from('contact_imports').select('*').eq('id', importId).single(), 'read finalized import')
  assert(summary.status === 'staged', `Expected staged status, got ${summary.status}`)
  assert(summary.total_rows === ROW_COUNT, `Expected ${ROW_COUNT} rows, got ${summary.total_rows}`)
  const count = await admin.from('contact_import_rows').select('id', { count: 'exact', head: true }).eq('import_id', importId)
  data(count, 'count finalized rows')
  assert(count.count === ROW_COUNT, `Expected ${ROW_COUNT} stored rows, got ${count.count}`)
  const history = data(await client.rpc('list_contact_imports', { p_organization_id: organizationId }), 'list finalized imports')
  assert(history.some((item) => item.import_id === importId && Number(item.total_rows) === ROW_COUNT), 'Finalized large import missing from history')
  console.log('✓ finalized import retains all rows above the former 5,000-row cap')

  const abortId = data(await client.rpc('begin_contact_import', {
    p_organization_id: organizationId,
    p_source_filename: 'cancel.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 7000000,
    p_source_sha256: 'b'.repeat(64),
    p_sheet_name: null,
    p_headers: ['Name', 'Mobile'],
    p_column_mapping: { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' },
  }), 'begin cancellable import')
  data(await client.rpc('append_contact_import_rows', { p_organization_id: organizationId, p_import_id: abortId, p_rows: [row(0)] }), 'append cancellable batch')
  data(await client.rpc('abort_contact_import', { p_organization_id: organizationId, p_import_id: abortId }), 'abort import')
  const aborted = data(await admin.from('contact_imports').select('id').eq('id', abortId), 'verify abort')
  assert(aborted.length === 0, 'Aborted staging session was not removed')
  console.log('✓ cancelled staging session is removed')

  console.log('\nBulkText Web 0.20.4 RECIPIENT IMPORT SCALE LOCAL PASS')
} finally {
  if (organizationId) {
    const result = await admin.from('organizations').delete().eq('id', organizationId)
    if (result.error) console.warn(`Cleanup warning (workspace): ${result.error.message}`)
  }
  if (userId) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup warning (user): ${result.error.message}`)
  }
}
