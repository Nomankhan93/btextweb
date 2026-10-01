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
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertNoError(result, label) {
  if (result.error) {
    const extra = [result.error.details, result.error.hint, result.error.code].filter(Boolean).join(' | ')
    throw new Error(`${label}: ${result.error.message}${extra ? ` | ${extra}` : ''}`)
  }
  return result.data
}
function userClient(url, key) { return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) }

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon/publishable key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run recipient-preview fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  owner: `bulktext-010-owner-${stamp}@example.test`,
  analyst: `bulktext-010-analyst-${stamp}@example.test`,
  manager: `bulktext-010-manager-${stamp}@example.test`,
  outsider: `bulktext-010-outsider-${stamp}@example.test`,
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
  const id = assertNoError(await client.rpc('create_organization', { p_name: name }), `create ${name}`)
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

const headers = ['Name', 'Mobile', 'City']
const mapping = { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' }
const rows = [
  { sourceRowNumber: 2, rawData: { Name: 'Ali original', Mobile: '03001234567', City: 'Karachi' }, rawPhone: '03001234567', firstName: null, lastName: null, displayName: 'Ali original', customFields: { City: 'Karachi' } },
  { sourceRowNumber: 3, rawData: { Name: 'Ali alternate', Mobile: '+92 300 123 4567', City: 'Hyderabad' }, rawPhone: '+92 300 123 4567', firstName: null, lastName: null, displayName: 'Ali alternate', customFields: { City: 'Hyderabad' } },
  { sourceRowNumber: 4, rawData: { Name: 'Landline', Mobile: '02134567890', City: 'Karachi' }, rawPhone: '02134567890', firstName: null, lastName: null, displayName: 'Landline', customFields: { City: 'Karachi' } },
  { sourceRowNumber: 5, rawData: { Name: 'Sara', Mobile: '03111234567', City: 'Sukkur' }, rawPhone: '03111234567', firstName: null, lastName: null, displayName: 'Sara', customFields: { City: 'Sukkur' } },
  { sourceRowNumber: 6, rawData: { Name: 'Usman', Mobile: '03221234567', City: 'Lahore' }, rawPhone: '03221234567', firstName: null, lastName: null, displayName: 'Usman', customFields: { City: 'Lahore' } },
]

try {
  console.log('BulkText 0.12.0 local Recipient Validation & Preview acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.12.0', `Expected schema version 0.12.0, received ${JSON.stringify(schemaMeta?.value)}`)
  assert(schemaMeta?.value?.recipient_validation_version === 'recipient-validation-v1', 'Recipient validation version metadata missing')
  assert(schemaMeta?.value?.consent_suppression_policy_version === 'consent-suppression-v1', 'Consent/suppression policy metadata missing')
  console.log('✓ 0.12.0 migration metadata present and the consent/suppression policy is present')

  const [ownerUser, analystUser, managerUser] = await Promise.all([
    createConfirmedUser(emails.owner, 'Preview Owner'),
    createConfirmedUser(emails.analyst, 'Preview Analyst'),
    createConfirmedUser(emails.manager, 'Preview Manager'),
    createConfirmedUser(emails.outsider, 'Preview Outsider'),
  ])
  const [owner, analyst, manager, outsider] = await Promise.all([
    signIn(emails.owner), signIn(emails.analyst), signIn(emails.manager), signIn(emails.outsider),
  ])
  const orgId = await createOrganization(owner, `Preview Org ${stamp}`)
  const outsiderOrg = await createOrganization(outsider, `Preview Other ${stamp}`)
  assertNoError(await admin.from('organization_members').insert([
    { organization_id: orgId, user_id: analystUser.id, role: 'analyst' },
    { organization_id: orgId, user_id: managerUser.id, role: 'campaign_manager' },
  ]), 'add role fixtures')

  const importId = assertNoError(await manager.rpc('create_contact_import', {
    p_organization_id: orgId,
    p_source_filename: 'recipient-preview.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 789,
    p_source_sha256: 'b'.repeat(64),
    p_sheet_name: null,
    p_headers: headers,
    p_column_mapping: mapping,
    p_rows: rows,
  }), 'stage recipient preview import')

  const validationRows = assertNoError(await owner.rpc('list_contact_import_validation_rows', { p_organization_id: orgId, p_import_id: importId }), 'list validation rows')
  assert(validationRows.length === 5, `Expected 5 validation rows, got ${validationRows.length}`)
  assert(Number(validationRows[0].duplicate_group_size) === 2 && Number(validationRows[1].duplicate_group_size) === 2, 'Duplicate group size was not computed')
  assert(validationRows[2].phone_validation_status === 'unsupported_number_type', 'Invalid phone status was not recomputed')
  console.log('✓ Validation rows are server-normalized and duplicate groups are explicit')

  const analystCreate = await analyst.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: [Number(validationRows[1].import_row_id), Number(validationRows[3].import_row_id)],
  })
  assert(analystCreate.error, 'Analyst unexpectedly created a recipient preview')
  console.log('✓ Analyst cannot create preview snapshots')

  const duplicateSelection = await manager.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: [Number(validationRows[0].import_row_id), Number(validationRows[1].import_row_id)],
  })
  assert(duplicateSelection.error, 'Server unexpectedly accepted two rows with the same canonical number')
  console.log('✓ Server rejects multiple selected rows for the same canonical number')

  const selectedIds = [Number(validationRows[1].import_row_id), Number(validationRows[3].import_row_id)]
  const previewId = assertNoError(await manager.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: selectedIds,
  }), 'create recipient preview')
  assert(typeof previewId === 'string' && previewId.length > 0, 'Preview creation did not return an identifier')

  const preview = assertNoError(await admin.from('recipient_previews').select('*').eq('id', previewId).single(), 'read recipient preview')
  assert(preview.total_rows === 5, 'Preview total mismatch')
  assert(preview.included_rows === 2, 'Preview included count mismatch')
  assert(preview.invalid_phone_rows === 1, 'Preview invalid count mismatch')
  assert(preview.duplicate_rows === 1, 'Preview duplicate count mismatch')
  assert(preview.manually_excluded_rows === 1, 'Preview manual exclusion count mismatch')

  const previewRows = assertNoError(await admin.from('recipient_preview_rows').select('*').eq('preview_id', previewId).order('source_row_number'), 'read preview rows')
  assert(previewRows[0].exclusion_reason === 'duplicate_in_file', 'Unselected duplicate row was not classified as duplicate')
  assert(previewRows[1].decision === 'included', 'Chosen duplicate row was not included')
  assert(previewRows[2].exclusion_reason === 'invalid_phone', 'Invalid row classification mismatch')
  assert(previewRows[3].decision === 'included', 'Second selected valid row missing')
  assert(previewRows[4].exclusion_reason === 'manually_excluded', 'Unselected unique valid row was not manually excluded')
  assert(previewRows[1].custom_fields?.City === 'Hyderabad', 'Preview did not snapshot custom fields')
  console.log('✓ Snapshot preserves selected duplicate choice, invalid rows, manual exclusions and row metadata')

  const ownerList = assertNoError(await owner.rpc('list_recipient_previews', { p_organization_id: orgId, p_import_id: importId }), 'owner list previews')
  const analystList = assertNoError(await analyst.rpc('list_recipient_previews', { p_organization_id: orgId, p_import_id: importId }), 'analyst list previews')
  assert(ownerList.length === 1 && analystList.length === 1, 'Organization members could not read preview history')
  const analystRows = assertNoError(await analyst.rpc('get_recipient_preview_rows', { p_organization_id: orgId, p_preview_id: previewId }), 'analyst read preview rows')
  assert(analystRows.length === 5, 'Analyst could not read stored preview rows')

  const outsideList = await outsider.rpc('list_recipient_previews', { p_organization_id: orgId, p_import_id: importId })
  assert(outsideList.error, 'Outside tenant unexpectedly listed recipient previews')
  const outsideTable = assertNoError(await outsider.from('recipient_preview_rows').select('id').eq('organization_id', orgId), 'outside tenant direct read')
  assert(outsideTable.length === 0, 'RLS leaked recipient preview rows across tenants')
  const outsiderOwn = assertNoError(await outsider.rpc('list_recipient_previews', { p_organization_id: outsiderOrg, p_import_id: null }), 'outsider own previews')
  assert(outsiderOwn.length === 0, 'Unexpected outsider preview fixtures')
  console.log('✓ Preview summaries and rows remain tenant isolated')

  const deleteAfterPreview = await manager.rpc('delete_contact_import', { p_organization_id: orgId, p_import_id: importId })
  assert(deleteAfterPreview.error, 'Import with recipient preview history was unexpectedly deleted')
  console.log('✓ Source import cannot be deleted after preview history exists')

  const directInsert = await owner.from('recipient_previews').insert({
    organization_id: orgId,
    import_id: importId,
    created_by: ownerUser.id,
    revision: 99,
    total_rows: 1,
    included_rows: 1,
  })
  assert(directInsert.error, 'Authenticated browser unexpectedly inserted recipient preview directly')
  console.log('✓ Preview writes remain RPC-only')

  const secondPreviewId = assertNoError(await owner.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: [Number(validationRows[0].import_row_id), Number(validationRows[4].import_row_id)],
  }), 'create second recipient preview')
  const revisions = assertNoError(await admin.from('recipient_previews').select('id,revision').eq('import_id', importId).order('revision'), 'read revisions')
  assert(revisions.length === 2 && revisions[0].revision === 1 && revisions[1].revision === 2, 'Preview revisions are not monotonic')
  assert(revisions[1].id === secondPreviewId, 'Second preview revision mismatch')
  console.log('✓ Re-running validation creates immutable monotonic revisions')

  const auditRows = assertNoError(await admin.from('audit_logs').select('action,target_id').eq('organization_id', orgId).eq('action', 'contacts.recipient_preview_created'), 'read preview audit events')
  assert(auditRows.some((row) => row.target_id === previewId) && auditRows.some((row) => row.target_id === secondPreviewId), 'Recipient preview audit events missing')
  console.log('✓ Recipient preview audit trail recorded')

  console.log('\nBulkText 0.12.0 RECIPIENT VALIDATION & PREVIEW LOCAL PASS')
} finally {
  await cleanup()
}
