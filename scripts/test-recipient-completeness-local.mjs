import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const ROW_COUNT = 1400
const PAGE_SIZE = 500

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
  const output = execFileSync(npx, ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return parseEnv(output)
}
function required(value, label) {
  if (!value) throw new Error(`${label} was not found. Start local Supabase and run this command from the BulkText project.`)
  return value
}
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertNoError(result, label) {
  if (result.error) {
    const extra = [result.error.details, result.error.hint, result.error.code].filter(Boolean).join(' | ')
    throw new Error(`${label}: ${result.error.message}${extra ? ` | ${extra}` : ''}`)
  }
  return result.data
}
function userClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
async function collectRpcRows(client, fn, args, maxRows = 5000) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await client.rpc(fn, args).range(from, from + PAGE_SIZE - 1)
    const page = assertNoError(result, `${fn} page ${from}-${from + PAGE_SIZE - 1}`) ?? []
    assert(Array.isArray(page), `${fn} returned a non-array page`)
    assert(rows.length + page.length <= maxRows, `${fn} exceeded ${maxRows} rows`)
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon/publishable key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run recipient-completeness fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const email = `bulktext-completeness-${stamp}@example.test`
let userId = null
let organizationId = null

async function cleanup() {
  if (organizationId) {
    const result = await admin.from('organizations').delete().eq('id', organizationId)
    if (result.error) console.warn(`Cleanup warning (organization): ${result.error.message}`)
  }
  if (userId) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup warning (user): ${result.error.message}`)
  }
}

try {
  console.log('BulkText 0.16.1 local recipient completeness acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Completeness Test' } })
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create completeness test user')
  userId = created.data.user.id
  const client = userClient(url, anonKey)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error

  const workspaces = assertNoError(await client.rpc('get_my_personal_workspace'), 'get personal workspace')
  organizationId = workspaces?.[0]?.workspace_id
  assert(typeof organizationId === 'string' && organizationId.length > 0, 'Personal workspace was not returned')

  const importRows = Array.from({ length: ROW_COUNT }, (_, index) => {
    const subscriber = String(index).padStart(7, '0')
    const phone = `0311${subscriber}`
    return {
      sourceRowNumber: index + 2,
      rawData: { Name: `Recipient ${index + 1}`, Mobile: phone },
      rawPhone: phone,
      firstName: null,
      lastName: null,
      displayName: `Recipient ${index + 1}`,
      customFields: {},
    }
  })

  const importId = assertNoError(await client.rpc('create_contact_import', {
    p_organization_id: organizationId,
    p_source_filename: 'recipient-completeness-1400.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 140000,
    p_source_sha256: 'c'.repeat(64),
    p_sheet_name: null,
    p_headers: ['Name', 'Mobile'],
    p_column_mapping: { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' },
    p_rows: importRows,
  }), 'create 1400-row contact import')

  const storedImportCount = assertNoError(await admin.from('contact_import_rows').select('id', { count: 'exact', head: true }).eq('import_id', importId), 'count stored import rows')
  assert(storedImportCount === null, 'Unexpected data for HEAD count query')
  const countResult = await admin.from('contact_import_rows').select('*', { count: 'exact', head: true }).eq('import_id', importId)
  if (countResult.error) throw countResult.error
  assert(countResult.count === ROW_COUNT, `Expected ${ROW_COUNT} stored rows, got ${countResult.count}`)

  const oneShot = assertNoError(await client.rpc('list_contact_import_validation_rows', {
    p_organization_id: organizationId,
    p_import_id: importId,
  }), 'one-shot validation-row request') ?? []
  console.log(`One-shot PostgREST RPC rows: ${oneShot.length}`)

  const validationRows = await collectRpcRows(client, 'list_contact_import_validation_rows', {
    p_organization_id: organizationId,
    p_import_id: importId,
  })
  assert(validationRows.length === ROW_COUNT, `Expected ${ROW_COUNT} paged validation rows, got ${validationRows.length}`)
  assert(Number(validationRows[0].source_row_number) === 2, 'First source row mismatch')
  assert(Number(validationRows.at(-1)?.source_row_number) === ROW_COUNT + 1, 'Last source row mismatch')
  console.log(`✓ Paged validation retrieval preserved all ${ROW_COUNT} rows`)

  const selectedIds = validationRows.map((row) => Number(row.import_row_id))
  const previewId = assertNoError(await client.rpc('create_recipient_preview', {
    p_organization_id: organizationId,
    p_import_id: importId,
    p_selected_row_ids: selectedIds,
  }), 'create complete recipient preview')

  const previewCountResult = await admin.from('recipient_preview_rows').select('*', { count: 'exact', head: true }).eq('preview_id', previewId)
  if (previewCountResult.error) throw previewCountResult.error
  assert(previewCountResult.count === ROW_COUNT, `Expected ${ROW_COUNT} stored preview rows, got ${previewCountResult.count}`)

  const previewRows = await collectRpcRows(client, 'get_recipient_preview_rows', {
    p_organization_id: organizationId,
    p_preview_id: previewId,
  })
  assert(previewRows.length === ROW_COUNT, `Expected ${ROW_COUNT} paged preview rows, got ${previewRows.length}`)
  assert(previewRows.every((row) => row.decision === 'included'), 'Not every completeness fixture row remained included')
  console.log(`✓ Preview persisted and reloaded all ${ROW_COUNT} included rows`)

  console.log('\nBulkText 0.16.1 RECIPIENT COMPLETENESS LOCAL PASS')
} finally {
  await cleanup()
}
