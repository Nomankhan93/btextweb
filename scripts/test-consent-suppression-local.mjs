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
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run consent/suppression fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const anonymous = userClient(url, anonKey)
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  owner: `bulktext-011-owner-${stamp}@example.test`,
  analyst: `bulktext-011-analyst-${stamp}@example.test`,
  manager: `bulktext-011-manager-${stamp}@example.test`,
  outsider: `bulktext-011-outsider-${stamp}@example.test`,
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

const headers = ['Name', 'Mobile']
const mapping = { phone: 'Mobile', firstName: null, lastName: null, displayName: 'Name' }
const sourceRows = [
  { sourceRowNumber: 2, rawData: { Name: 'Ali', Mobile: '03001234567' }, rawPhone: '03001234567', firstName: null, lastName: null, displayName: 'Ali', customFields: {} },
  { sourceRowNumber: 3, rawData: { Name: 'Sara', Mobile: '03111234567' }, rawPhone: '03111234567', firstName: null, lastName: null, displayName: 'Sara', customFields: {} },
  { sourceRowNumber: 4, rawData: { Name: 'Usman', Mobile: '03221234567' }, rawPhone: '03221234567', firstName: null, lastName: null, displayName: 'Usman', customFields: {} },
  { sourceRowNumber: 5, rawData: { Name: 'Ayesha', Mobile: '03331234567' }, rawPhone: '03331234567', firstName: null, lastName: null, displayName: 'Ayesha', customFields: {} },
  { sourceRowNumber: 6, rawData: { Name: 'Bilal', Mobile: '03441234567' }, rawPhone: '03441234567', firstName: null, lastName: null, displayName: 'Bilal', customFields: {} },
]

try {
  console.log('BulkText 0.12.0 local Consent & Suppression acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.12.0', `Expected schema version 0.12.0, received ${JSON.stringify(schemaMeta?.value)}`)
  assert(schemaMeta?.value?.phase === 'message_composer_personalization', 'Latest schema phase metadata missing')
  assert(schemaMeta?.value?.consent_suppression_policy_version === 'consent-suppression-v1', 'Consent/suppression policy metadata missing')
  assert(schemaMeta?.value?.campaign_send_enabled === false, '0.11 must not enable campaign sending')
  console.log('✓ 0.12.0 schema metadata present; consent policy retained and campaign sending remains gated')

  const anonymousLookup = await anonymous.rpc('get_contact_compliance_status', { p_organization_id: crypto.randomUUID(), p_phone: '03001234567' })
  assert(anonymousLookup.error, 'Anonymous client unexpectedly executed compliance lookup')
  console.log('✓ Compliance RPCs require authentication')

  const [ownerUser, analystUser, managerUser] = await Promise.all([
    createConfirmedUser(emails.owner, 'Compliance Owner'),
    createConfirmedUser(emails.analyst, 'Compliance Analyst'),
    createConfirmedUser(emails.manager, 'Compliance Manager'),
    createConfirmedUser(emails.outsider, 'Compliance Outsider'),
  ])
  const [owner, analyst, manager, outsider] = await Promise.all([
    signIn(emails.owner), signIn(emails.analyst), signIn(emails.manager), signIn(emails.outsider),
  ])
  const orgId = await createOrganization(owner, `Compliance Org ${stamp}`)
  const outsiderOrg = await createOrganization(outsider, `Compliance Other ${stamp}`)
  assertNoError(await admin.from('organization_members').insert([
    { organization_id: orgId, user_id: analystUser.id, role: 'analyst' },
    { organization_id: orgId, user_id: managerUser.id, role: 'campaign_manager' },
  ]), 'add role fixtures')
  console.log('✓ Tenant and role fixtures created')

  const importId = assertNoError(await manager.rpc('create_contact_import', {
    p_organization_id: orgId,
    p_source_filename: 'consent-gate.csv',
    p_source_type: 'csv',
    p_source_size_bytes: 900,
    p_source_sha256: 'c'.repeat(64),
    p_sheet_name: null,
    p_headers: headers,
    p_column_mapping: mapping,
    p_rows: sourceRows,
  }), 'stage consent gate import')
  const validationRows = assertNoError(await manager.rpc('list_contact_import_validation_rows', { p_organization_id: orgId, p_import_id: importId }), 'load validation rows')
  const selectedIds = validationRows.map((row) => Number(row.import_row_id))
  const previewId = assertNoError(await manager.rpc('create_recipient_preview', {
    p_organization_id: orgId,
    p_import_id: importId,
    p_selected_row_ids: selectedIds,
  }), 'create recipient preview')
  console.log('✓ Recipient preview fixture created with five unique valid candidates')

  const initialRows = assertNoError(await analyst.rpc('list_recipient_eligibility_rows', { p_organization_id: orgId, p_preview_id: previewId }), 'analyst inspect eligibility')
  assert(initialRows.length === 5, `Expected 5 eligibility candidates, got ${initialRows.length}`)
  assert(initialRows.every((row) => row.block_reason === 'no_consent'), 'Recipients without evidence should default to no_consent')
  console.log('✓ No consent is assumed; all new candidates are blocked by default')

  const analystGrant = await analyst.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03001234567', p_event_type: 'granted', p_source: 'manual',
    p_evidence_note: 'fixture', p_evidence_reference: null, p_occurred_at: null, p_expires_at: null,
  })
  assert(analystGrant.error, 'Analyst unexpectedly recorded consent')

  const noEvidence = await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03001234567', p_event_type: 'granted', p_source: 'manual',
    p_evidence_note: null, p_evidence_reference: null, p_occurred_at: null, p_expires_at: null,
  })
  assert(noEvidence.error, 'Consent grant without evidence unexpectedly succeeded')
  console.log('✓ Consent writes are role-gated and require evidence')

  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03001234567', p_event_type: 'granted', p_source: 'web_form',
    p_evidence_note: 'Web opt-in fixture', p_evidence_reference: `form-${stamp}`, p_occurred_at: null, p_expires_at: null,
  }), 'grant Ali consent')

  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03221234567', p_event_type: 'granted', p_source: 'paper_form',
    p_evidence_note: 'Paper form fixture', p_evidence_reference: `paper-${stamp}`, p_occurred_at: null, p_expires_at: null,
  }), 'grant Usman consent')
  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03221234567', p_event_type: 'revoked', p_source: 'manual',
    p_evidence_note: 'Recipient withdrew consent', p_evidence_reference: `revoke-${stamp}`, p_occurred_at: null, p_expires_at: null,
  }), 'revoke Usman consent')

  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03331234567', p_event_type: 'granted', p_source: 'verbal',
    p_evidence_note: 'Consent captured before opt-out', p_evidence_reference: `call-${stamp}`, p_occurred_at: null, p_expires_at: null,
  }), 'grant Ayesha consent')
  assertNoError(await manager.rpc('record_contact_suppression', {
    p_organization_id: orgId, p_phone: '03331234567', p_event_type: 'suppressed', p_reason: 'opt_out',
    p_source: 'recipient_reply', p_note: 'STOP reply fixture', p_occurred_at: null,
  }), 'suppress Ayesha')

  const historicalGrant = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const historicalExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03441234567', p_event_type: 'granted', p_source: 'import',
    p_evidence_note: 'Historical consent with expiry', p_evidence_reference: `legacy-${stamp}`, p_occurred_at: historicalGrant, p_expires_at: historicalExpiry,
  }), 'record expired Bilal consent')
  console.log('✓ Granted, revoked, expired and suppressed fixture states recorded as append-only events')

  const liveRows = assertNoError(await owner.rpc('list_recipient_eligibility_rows', { p_organization_id: orgId, p_preview_id: previewId }), 'evaluate live eligibility')
  const byPhone = Object.fromEntries(liveRows.map((row) => [row.normalized_e164, row]))
  assert(byPhone['+923001234567']?.eligibility_state === 'eligible', 'Granted/clear recipient should be eligible')
  assert(byPhone['+923111234567']?.block_reason === 'no_consent', 'No-consent recipient not blocked correctly')
  assert(byPhone['+923221234567']?.block_reason === 'consent_revoked', 'Revoked recipient not blocked correctly')
  assert(byPhone['+923331234567']?.block_reason === 'suppressed', 'Suppression should override active consent')
  assert(byPhone['+923441234567']?.block_reason === 'consent_expired', 'Expired consent not blocked correctly')
  console.log('✓ Eligibility policy applies consent state and suppression override correctly')

  const outsiderLookup = await outsider.rpc('get_contact_compliance_status', { p_organization_id: orgId, p_phone: '03001234567' })
  assert(outsiderLookup.error, 'Cross-tenant compliance lookup unexpectedly succeeded')
  const outsiderEvents = await outsider.from('contact_consent_events').select('id').eq('organization_id', orgId)
  assert(outsiderEvents.error || (outsiderEvents.data ?? []).length === 0, 'Raw consent evidence leaked across tenants')
  const ownOther = assertNoError(await outsider.rpc('list_contact_compliance_statuses', { p_organization_id: outsiderOrg, p_limit: 100 }), 'outside tenant own compliance registry')
  assert(ownOther.length === 0, 'Unexpected compliance fixtures in outside organization')
  console.log('✓ Consent/suppression records and RPCs remain tenant isolated')

  const directInsert = await owner.from('contact_consent_events').insert({
    organization_id: orgId,
    normalized_e164: '+923551234567',
    event_type: 'granted',
    source: 'manual',
    evidence_note: 'bypass',
    occurred_at: new Date().toISOString(),
    recorded_by: ownerUser.id,
  })
  assert(directInsert.error, 'Authenticated browser unexpectedly inserted directly into contact_consent_events')
  console.log('✓ Compliance writes remain RPC-only')

  const snapshot1 = assertNoError(await manager.rpc('create_recipient_eligibility_snapshot', { p_organization_id: orgId, p_preview_id: previewId }), 'create eligibility snapshot 1')
  const summary1 = assertNoError(await admin.from('recipient_eligibility_snapshots').select('*').eq('id', snapshot1).single(), 'read eligibility snapshot 1')
  assert(summary1.candidate_rows === 5 && summary1.eligible_rows === 1, `Unexpected snapshot 1 totals: ${JSON.stringify(summary1)}`)
  assert(summary1.no_consent_rows === 1 && summary1.consent_revoked_rows === 1 && summary1.consent_expired_rows === 1 && summary1.suppressed_rows === 1, 'Snapshot 1 block breakdown mismatch')
  console.log('✓ Immutable eligibility snapshot freezes the current policy result')

  const managerLift = await manager.rpc('record_contact_suppression', {
    p_organization_id: orgId, p_phone: '03331234567', p_event_type: 'lifted', p_reason: null,
    p_source: 'manual', p_note: 'manager should not be allowed', p_occurred_at: null,
  })
  assert(managerLift.error, 'Campaign Manager unexpectedly lifted suppression')
  assertNoError(await owner.rpc('record_contact_suppression', {
    p_organization_id: orgId, p_phone: '03331234567', p_event_type: 'lifted', p_reason: null,
    p_source: 'manual', p_note: 'Owner verified release fixture', p_occurred_at: null,
  }), 'owner lift suppression')
  assertNoError(await manager.rpc('record_contact_consent', {
    p_organization_id: orgId, p_phone: '03111234567', p_event_type: 'granted', p_source: 'manual',
    p_evidence_note: 'Late evidence fixture', p_evidence_reference: `late-${stamp}`, p_occurred_at: null, p_expires_at: null,
  }), 'grant Sara consent')
  console.log('✓ Campaign Manager can suppress but only Owner/Admin can lift suppression')

  const snapshot2 = assertNoError(await owner.rpc('create_recipient_eligibility_snapshot', { p_organization_id: orgId, p_preview_id: previewId }), 'create eligibility snapshot 2')
  const summary2 = assertNoError(await admin.from('recipient_eligibility_snapshots').select('*').eq('id', snapshot2).single(), 'read eligibility snapshot 2')
  assert(summary2.revision === 2, 'Second eligibility snapshot did not increment revision')
  assert(summary2.eligible_rows === 3 && summary2.no_consent_rows === 0 && summary2.suppressed_rows === 0, `Unexpected snapshot 2 totals: ${JSON.stringify(summary2)}`)
  assert(summary2.consent_revoked_rows === 1 && summary2.consent_expired_rows === 1, 'Snapshot 2 remaining blocks mismatch')

  const snapshot1Rows = assertNoError(await owner.rpc('get_recipient_eligibility_snapshot_rows', { p_organization_id: orgId, p_snapshot_id: snapshot1 }), 'read snapshot 1 rows after changes')
  assert(snapshot1Rows.filter((row) => row.eligibility_state === 'eligible').length === 1, 'Snapshot 1 changed after later compliance events')
  assert(snapshot1Rows.some((row) => row.normalized_e164 === '+923331234567' && row.block_reason === 'suppressed'), 'Snapshot 1 lost original suppression decision')
  console.log('✓ Later consent/suppression events do not mutate prior eligibility snapshots')

  const recent = assertNoError(await analyst.rpc('list_contact_compliance_statuses', { p_organization_id: orgId, p_limit: 100 }), 'analyst list compliance statuses')
  assert(recent.length === 5, `Expected five phone statuses, got ${recent.length}`)
  const statusAyesha = assertNoError(await analyst.rpc('get_contact_compliance_status', { p_organization_id: orgId, p_phone: '+923331234567' }), 'lookup lifted Ayesha status')
  assert(statusAyesha[0]?.suppression_state === 'clear' && statusAyesha[0]?.eligibility_state === 'eligible', 'Lifted suppression did not restore eligibility with active consent')
  console.log('✓ Members can inspect current compliance registry and current state')
  const managerHistory = assertNoError(await manager.rpc('list_contact_compliance_history', { p_organization_id: orgId, p_phone: '+923331234567' }), 'manager read compliance evidence history')
  assert(managerHistory.length >= 3, 'Expected consent, suppression and lift events in manager evidence history')
  const analystHistory = await analyst.rpc('list_contact_compliance_history', { p_organization_id: orgId, p_phone: '+923331234567' })
  assert(analystHistory.error, 'Analyst unexpectedly read detailed compliance evidence history')
  console.log('✓ Detailed evidence history is limited to compliance-managing roles')


  const auditRows = assertNoError(await admin.from('audit_logs').select('action,target_id').eq('organization_id', orgId).in('action', [
    'contacts.consent_granted', 'contacts.consent_revoked', 'contacts.suppressed', 'contacts.suppression_lifted', 'contacts.eligibility_snapshot_created',
  ]), 'read compliance audit events')
  for (const action of ['contacts.consent_granted', 'contacts.consent_revoked', 'contacts.suppressed', 'contacts.suppression_lifted', 'contacts.eligibility_snapshot_created']) {
    assert(auditRows.some((row) => row.action === action), `Audit action missing: ${action}`)
  }
  console.log('✓ Consent, suppression and eligibility actions are audit logged')

  console.log('\nBulkText 0.12.0 CONSENT & SUPPRESSION LOCAL PASS')
} finally {
  await cleanup()
}
