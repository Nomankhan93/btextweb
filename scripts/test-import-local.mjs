import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

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

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon/publishable key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run import fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  owner: `bulktext-090-owner-${stamp}@example.test`,
  analyst: `bulktext-090-analyst-${stamp}@example.test`,
  manager: `bulktext-090-manager-${stamp}@example.test`,
  outsider: `bulktext-090-outsider-${stamp}@example.test`,
}
const createdUserIds = []
const createdOrganizationIds = []

async function createConfirmedUser(email, displayName) {
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } })
  if (result.error || !result.data.user) throw result.error ?? new Error(`Could not create ${email}`)
  createdUserIds.push(result.data.user.id)
  return result.data.user
}

async function signIn(email) {
  const client = userClient(url, anonKey)
  const result = await client.auth.signInWithPassword({ email, password })
  if (result.error) throw result.error
  return client
}

async function createOrganization(client, name) {
  const rows = assertNoError(await client.rpc('get_my_personal_workspace'), `get personal workspace for ${name}`)
  const id = rows?.[0]?.workspace_id
  assert(typeof id === 'string' && id.length > 0, `${name} did not return a personal workspace UUID`)
  createdOrganizationIds.push(id)
  return id
}

async function cleanup() {
  if (createdOrganizationIds.length) {
    const result = await admin.from('organizations').delete().in('id', createdOrganizationIds)
    if (result.error) console.warn(`Cleanup warning (organizations): ${result.error.message}`)
  }
  for (const userId of createdUserIds) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup warning (user ${userId}): ${result.error.message}`)
  }
}

const sha = 'a'.repeat(64)
const headers = ['First Name', 'Mobile Number', 'City']
const mapping = { phone: 'Mobile Number', firstName: 'First Name', lastName: null, displayName: null }
const rows = [
  { sourceRowNumber: 2, rawData: { 'First Name': 'Ali', 'Mobile Number': '03001234567', City: 'Karachi' }, rawPhone: '03001234567', firstName: 'Ali', lastName: null, displayName: 'Ali', customFields: { City: 'Karachi' } },
  { sourceRowNumber: 3, rawData: { 'First Name': 'Sara', 'Mobile Number': '+92 300 123 4567', City: 'Hyderabad' }, rawPhone: '+92 300 123 4567', firstName: 'Sara', lastName: null, displayName: 'Sara', customFields: { City: 'Hyderabad' } },
  { sourceRowNumber: 4, rawData: { 'First Name': 'Landline', 'Mobile Number': '02134567890', City: 'Karachi' }, rawPhone: '02134567890', firstName: 'Landline', lastName: null, displayName: 'Landline', customFields: { City: 'Karachi' } },
]

try {
  console.log('BulkText 0.12.1 local Excel / CSV import acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.12.1', `Expected schema version 0.12.1, received ${JSON.stringify(schemaMeta?.value)}`)
  console.log('✓ 0.12.1 migration metadata present')

  const [ownerUser, analystUser, managerUser] = await Promise.all([
    createConfirmedUser(emails.owner, 'Import Owner'),
    createConfirmedUser(emails.analyst, 'Import Analyst'),
    createConfirmedUser(emails.manager, 'Import Manager'),
    createConfirmedUser(emails.outsider, 'Import Outsider'),
  ])
  const [owner, analyst, manager, outsider] = await Promise.all([
    signIn(emails.owner), signIn(emails.analyst), signIn(emails.manager), signIn(emails.outsider),
  ])
  const orgId = await createOrganization(owner, `Import Org ${stamp}`)
  const outsideOrg = await createOrganization(outsider, `Import Other ${stamp}`)
  assertNoError(await admin.from('organization_members').insert([
    { organization_id: orgId, user_id: analystUser.id, role: 'analyst' },
    { organization_id: orgId, user_id: managerUser.id, role: 'campaign_manager' },
  ]), 'add role fixtures')
  console.log('✓ Tenant and role fixtures created')

  const analystCreate = await analyst.rpc('create_contact_import', {
    p_organization_id: orgId,
    p_source_filename: 'analyst.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 123,
    p_source_sha256: sha,
    p_sheet_name: null,
    p_headers: headers,
    p_column_mapping: mapping,
    p_rows: rows,
  })
  assert(analystCreate.error, 'Analyst unexpectedly staged a contact import')
  console.log('✓ Analyst cannot stage imports')

  const importId = assertNoError(await manager.rpc('create_contact_import', {
    p_organization_id: orgId,
    p_source_filename: 'customers.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 456,
    p_source_sha256: sha,
    p_sheet_name: null,
    p_headers: headers,
    p_column_mapping: mapping,
    p_rows: rows,
  }), 'campaign manager stage import')
  assert(typeof importId === 'string' && importId.length > 0, 'Import staging did not return an identifier')
  console.log('✓ Campaign Manager can stage an import')

  const batch = assertNoError(await admin.from('contact_imports').select('*').eq('id', importId).single(), 'read staged batch')
  assert(batch.organization_id === orgId, 'Import organization mismatch')
  assert(batch.total_rows === 3, `Expected 3 staged rows, received ${batch.total_rows}`)
  assert(batch.valid_phone_rows === 2 && batch.invalid_phone_rows === 1 && batch.duplicate_phone_rows === 1, `Unexpected import summary ${JSON.stringify(batch)}`)

  const stagedRows = assertNoError(await admin.from('contact_import_rows').select('*').eq('import_id', importId).order('source_row_number'), 'read staged rows')
  assert(stagedRows.length === 3, `Expected 3 staged rows, received ${stagedRows.length}`)
  assert(stagedRows[0].normalized_e164 === '+923001234567', 'Server did not normalize first phone number')
  assert(stagedRows[1].normalized_e164 === '+923001234567' && stagedRows[1].duplicate_in_file === true, 'Server did not mark duplicate canonical phone')
  assert(stagedRows[2].normalized_e164 === null && stagedRows[2].phone_validation_status === 'unsupported_number_type', 'Invalid phone row was not retained for review')
  assert(stagedRows[0].custom_fields?.City === 'Karachi', 'Custom fields were not preserved')
  console.log('✓ Server re-normalizes phones, retains invalid rows, marks duplicates and preserves custom fields')

  const ownerList = assertNoError(await owner.rpc('list_contact_imports', { p_organization_id: orgId }), 'owner list imports')
  const analystList = assertNoError(await analyst.rpc('list_contact_imports', { p_organization_id: orgId }), 'analyst list imports')
  assert(ownerList.length === 1 && analystList.length === 1, 'Organization members could not read import history')

  const crossTenant = await outsider.rpc('list_contact_imports', { p_organization_id: orgId })
  assert(crossTenant.error, 'Outside tenant unexpectedly read import history')
  const crossTable = assertNoError(await outsider.from('contact_import_rows').select('id').eq('organization_id', orgId), 'outside tenant row query')
  assert(crossTable.length === 0, 'RLS leaked staged import rows across tenants')
  const ownOther = assertNoError(await outsider.rpc('list_contact_imports', { p_organization_id: outsideOrg }), 'outside tenant own import list')
  assert(ownOther.length === 0, 'Unexpected fixture data in outside organization')
  console.log('✓ Import history and staged rows remain tenant isolated')

  const directInsert = await owner.from('contact_imports').insert({
    organization_id: orgId,
    uploaded_by: ownerUser.id,
    source_filename: 'bypass.csv',
    source_type: 'csv',
    source_size_bytes: 10,
    source_sha256: sha,
    headers,
    column_mapping: mapping,
    total_rows: 1,
  })
  assert(directInsert.error, 'Authenticated browser unexpectedly inserted directly into contact_imports')
  console.log('✓ Import writes remain RPC-only')

  const analystDelete = await analyst.rpc('delete_contact_import', { p_organization_id: orgId, p_import_id: importId })
  assert(analystDelete.error, 'Analyst unexpectedly deleted a staged import')
  assertNoError(await manager.rpc('delete_contact_import', { p_organization_id: orgId, p_import_id: importId }), 'campaign manager delete import')
  const afterDelete = assertNoError(await admin.from('contact_import_rows').select('id').eq('import_id', importId), 'verify cascade delete')
  assert(afterDelete.length === 0, 'Deleting import did not cascade staged rows')
  console.log('✓ Authorized delete cascades staged rows and unauthorized delete is blocked')

  const auditRows = assertNoError(await admin.from('audit_logs').select('action,target_id').eq('organization_id', orgId).in('action', ['contacts.import_staged', 'contacts.import_deleted']), 'read import audit events')
  assert(auditRows.some((row) => row.action === 'contacts.import_staged' && row.target_id === importId), 'Import staging audit event missing')
  assert(auditRows.some((row) => row.action === 'contacts.import_deleted' && row.target_id === importId), 'Import deletion audit event missing')
  console.log('✓ Import audit trail recorded')

  console.log('\nBulkText 0.12.1 EXCEL / CSV IMPORT LOCAL PASS')
} finally {
  await cleanup()
}
