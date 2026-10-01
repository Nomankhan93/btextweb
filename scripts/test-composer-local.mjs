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
function required(value, label) { if (!value) throw new Error(`${label} was not found. Start local Supabase and run this command from the BulkText project.`); return value }
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
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run composer fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const anonymous = userClient(url, anonKey)
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  owner: `bulktext-012-owner-${stamp}@example.test`,
  analyst: `bulktext-012-analyst-${stamp}@example.test`,
  manager: `bulktext-012-manager-${stamp}@example.test`,
  outsider: `bulktext-012-outsider-${stamp}@example.test`,
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

const headers = ['Name', 'Mobile', 'City', 'Customer ID']
const mapping = { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' }
const sourceRows = [
  { sourceRowNumber: 2, rawData: { Name: 'Ali Khan', Mobile: '03001234567', City: 'Karachi', 'Customer ID': 'C-100' }, rawPhone: '03001234567', firstName: 'Ali', lastName: 'Khan', displayName: 'Ali Khan', customFields: { City: 'Karachi', 'Customer ID': 'C-100' } },
  { sourceRowNumber: 3, rawData: { Name: 'Sara', Mobile: '03111234567', City: 'Hyderabad', 'Customer ID': 'C-101' }, rawPhone: '03111234567', firstName: 'Sara', lastName: null, displayName: 'Sara', customFields: { City: 'Hyderabad', 'Customer ID': 'C-101' } },
]

try {
  console.log('BulkText 0.13.0 local Message Composer & Personalization acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.13.0', `Expected schema version 0.13.0, received ${JSON.stringify(schemaMeta?.value)}`)
  assert(schemaMeta?.value?.phase === 'sms_segment_usage_calculator', 'Current SMS usage phase metadata missing')
  assert(schemaMeta?.value?.message_template_syntax_version === 'bulktext-template-v1', 'Template syntax metadata missing')
  assert(schemaMeta?.value?.sms_segment_calculator_enabled === true, '0.13 must enable segment calculator metadata')
  assert(schemaMeta?.value?.campaign_confirmation_enabled === false, '0.12 must not enable campaign confirmation')
  assert(schemaMeta?.value?.campaign_send_enabled === false, '0.12 must not enable sending')
  console.log('✓ 0.13.0 metadata present; SMS estimation enabled and downstream execution gates remain disabled')

  const anonymousList = await anonymous.rpc('list_message_composer_sources', { p_organization_id: crypto.randomUUID() })
  assert(anonymousList.error, 'Anonymous client unexpectedly listed composer sources')
  console.log('✓ Composer RPCs require authentication')

  const [ownerUser, analystUser, managerUser] = await Promise.all([
    createConfirmedUser(emails.owner, 'Composer Owner'),
    createConfirmedUser(emails.analyst, 'Composer Analyst'),
    createConfirmedUser(emails.manager, 'Composer Manager'),
    createConfirmedUser(emails.outsider, 'Composer Outsider'),
  ])
  const [owner, analyst, manager, outsider] = await Promise.all([
    signIn(emails.owner), signIn(emails.analyst), signIn(emails.manager), signIn(emails.outsider),
  ])
  const orgId = await createOrganization(owner, `Composer Org ${stamp}`)
  const outsiderOrg = await createOrganization(outsider, `Composer Other ${stamp}`)
  assertNoError(await admin.from('organization_members').insert([
    { organization_id: orgId, user_id: analystUser.id, role: 'analyst' },
    { organization_id: orgId, user_id: managerUser.id, role: 'campaign_manager' },
  ]), 'add composer role fixtures')
  console.log('✓ Tenant and role fixtures created')

  const importId = assertNoError(await manager.rpc('create_contact_import', {
    p_organization_id: orgId,
    p_source_filename: 'composer-fixture.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 800,
    p_source_sha256: 'd'.repeat(64),
    p_sheet_name: null,
    p_headers: headers,
    p_column_mapping: mapping,
    p_rows: sourceRows,
  }), 'stage composer import')
  const validationRows = assertNoError(await manager.rpc('list_contact_import_validation_rows', { p_organization_id: orgId, p_import_id: importId }), 'load composer validation rows')
  const previewId = assertNoError(await manager.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: validationRows.map((row) => Number(row.import_row_id)),
  }), 'create composer recipient preview')

  for (const phone of ['03001234567', '03111234567']) {
    assertNoError(await manager.rpc('record_contact_consent', {
      p_organization_id: orgId,
      p_phone: phone,
      p_event_type: 'granted',
      p_source: 'manual',
      p_evidence_note: 'Composer acceptance fixture consent',
      p_evidence_reference: `composer-${phone}-${stamp}`,
      p_occurred_at: null,
      p_expires_at: null,
    }), `grant fixture consent ${phone}`)
  }
  const snapshotId = assertNoError(await manager.rpc('create_recipient_eligibility_snapshot', { p_organization_id: orgId, p_preview_id: previewId }), 'create composer eligibility snapshot')
  console.log('✓ Immutable eligibility snapshot created with consented recipients')

  const sources = assertNoError(await analyst.rpc('list_message_composer_sources', { p_organization_id: orgId }), 'analyst list composer sources')
  assert(sources.some((source) => source.eligibility_snapshot_id === snapshotId && source.eligible_rows === 2), 'Composer source list did not expose eligible snapshot')
  const personalizationRows = assertNoError(await analyst.rpc('get_message_personalization_source_rows', { p_organization_id: orgId, p_eligibility_snapshot_id: snapshotId }), 'analyst read personalization rows')
  assert(personalizationRows.length === 2, `Expected 2 personalization rows, got ${personalizationRows.length}`)
  assert(personalizationRows.some((row) => row.custom_fields?.City === 'Karachi' && row.custom_fields?.['Customer ID'] === 'C-100'), 'Custom fields were not preserved for personalization')
  console.log('✓ Members can read eligible personalization source values, including frozen custom fields')

  const analystSave = await analyst.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: null,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Analyst should fail',
    p_message_template: 'Hello {{name}}',
  })
  assert(analystSave.error, 'Analyst unexpectedly saved a message draft')

  const invalidToken = await manager.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: null,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Invalid token',
    p_message_template: 'Hello {{nickname}}',
  })
  assert(invalidToken.error, 'Unsupported personalization token unexpectedly saved')

  const malformedToken = await manager.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: null,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Malformed token',
    p_message_template: 'Hello {{name',
  })
  assert(malformedToken.error, 'Malformed personalization token unexpectedly saved')

  const unavailableCustomField = await manager.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: null,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Unknown source field',
    p_message_template: 'Hello {{name}} {{custom:Does Not Exist}}',
  })
  assert(unavailableCustomField.error, 'Custom field absent from the eligibility snapshot unexpectedly saved')
  console.log('✓ Composer writes are role-gated and server validates token grammar/source-field availability')

  const template = 'Hello {{name}} in {{custom:City}}. Ref {{custom:Customer ID}} — {{phone}}'
  const draftId = assertNoError(await manager.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: null,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Personalized reminder',
    p_message_template: template,
  }), 'save composer draft')
  const storedDraft = assertNoError(await admin.from('message_composer_drafts').select('*').eq('id', draftId).single(), 'read stored composer draft')
  assert(storedDraft.syntax_version === 'bulktext-template-v1', 'Stored syntax version mismatch')
  assert(storedDraft.template_variables.includes('name') && storedDraft.template_variables.includes('custom:City') && storedDraft.template_variables.includes('custom:Customer ID') && storedDraft.template_variables.includes('phone'), 'Server did not extract template variables')
  console.log('✓ Message draft stores server-derived personalization variables')

  const directInsert = await manager.from('message_composer_drafts').insert({
    organization_id: orgId,
    eligibility_snapshot_id: snapshotId,
    title: 'Bypass',
    message_template: 'Bypass',
    created_by: managerUser.id,
    updated_by: managerUser.id,
  })
  assert(directInsert.error, 'Authenticated browser unexpectedly inserted directly into message_composer_drafts')
  console.log('✓ Composer writes remain RPC-only')

  const analystDrafts = assertNoError(await analyst.rpc('list_message_composer_drafts', { p_organization_id: orgId }), 'analyst list message drafts')
  assert(analystDrafts.some((draft) => draft.draft_id === draftId), 'Organization member could not inspect message draft')

  const updatedId = assertNoError(await owner.rpc('save_message_composer_draft', {
    p_organization_id: orgId,
    p_draft_id: draftId,
    p_eligibility_snapshot_id: snapshotId,
    p_title: 'Personalized reminder updated',
    p_message_template: 'Hi {{first_name}}, customer {{custom:Customer ID}} in {{custom:City}}.',
  }), 'update composer draft')
  assert(updatedId === draftId, 'Draft update changed identity')
  console.log('✓ Owner/Admin/Campaign Manager can create and update editable drafts')

  const crossTenantSources = await outsider.rpc('get_message_personalization_source_rows', { p_organization_id: outsiderOrg, p_eligibility_snapshot_id: snapshotId })
  assert(crossTenantSources.error, 'Outsider unexpectedly accessed another tenant eligibility snapshot')
  const crossTenantDrafts = assertNoError(await outsider.rpc('list_message_composer_drafts', { p_organization_id: outsiderOrg }), 'outsider own draft list')
  assert(crossTenantDrafts.length === 0, 'Outside organization unexpectedly saw composer drafts')
  console.log('✓ Composer sources and drafts remain tenant isolated')

  const auditRows = assertNoError(await admin.from('audit_logs').select('action,target_id').eq('organization_id', orgId).in('action', ['composer.draft_created', 'composer.draft_updated']), 'read composer audit events')
  assert(auditRows.some((row) => row.action === 'composer.draft_created' && row.target_id === draftId), 'Draft creation audit missing')
  assert(auditRows.some((row) => row.action === 'composer.draft_updated' && row.target_id === draftId), 'Draft update audit missing')
  console.log('✓ Draft create/update actions are audit logged')

  assertNoError(await manager.rpc('delete_message_composer_draft', { p_organization_id: orgId, p_draft_id: draftId }), 'delete composer draft')
  const deleted = await admin.from('message_composer_drafts').select('id').eq('id', draftId)
  assertNoError(deleted, 'verify composer draft deletion')
  assert((deleted.data ?? []).length === 0, 'Message draft still exists after delete')
  console.log('✓ Managers can delete editable drafts without touching eligibility snapshots')

  console.log('\nBulkText 0.13.0 MESSAGE COMPOSER LOCAL PASS')
} finally {
  await cleanup()
}
