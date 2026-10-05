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
  return parseEnv(execFileSync(npx, ['supabase', 'status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}
function required(value, label) { if (!value) throw new Error(`${label} was not found.`); return value }
function assert(condition, message) { if (!condition) throw new Error(message) }
function assertNoError(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}${result.error.code ? ` | ${result.error.code}` : ''}`)
  return result.data
}
function userClient(url, key) { return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) }

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing non-local URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Unexpected BulkText local API port: ${parsedUrl.port}`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const anonymous = userClient(url, anonKey)
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 9)}`
const password = `BulkText-${stamp}-Aa1!`
const createdUsers = []
const createdOrgs = []

async function createUser(prefix) {
  const email = `bulktext-016-${prefix}-${stamp}@example.test`
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: `Queue ${prefix}` } })
  if (result.error || !result.data.user) throw result.error ?? new Error('Could not create user')
  createdUsers.push(result.data.user.id)
  const client = userClient(url, anonKey)
  const signed = await client.auth.signInWithPassword({ email, password })
  if (signed.error) throw signed.error
  const rows = assertNoError(await client.rpc('get_my_personal_workspace'), 'get personal workspace')
  const orgId = rows?.[0]?.workspace_id
  assert(orgId, 'Personal workspace missing')
  createdOrgs.push(orgId)
  return { user: result.data.user, client, orgId }
}

async function pairDevice(owner, installation) {
  const pairing = assertNoError(await owner.client.rpc('create_gateway_pairing_code', { p_organization_id: owner.orgId }), 'create pairing')?.[0]
  const claimed = assertNoError(await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: pairing.pairing_code,
    p_device_name: `Queue Gateway ${installation}`,
    p_installation_id: installation,
  }), 'claim gateway')?.[0]
  assert(claimed?.device_id && claimed?.credential, 'Pairing did not return device credential')
  return { deviceId: claimed.device_id, credential: claimed.credential }
}

async function reportAndBind(owner, device, simHash) {
  assertNoError(await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: device.deviceId,
    p_credential: device.credential,
    p_device: { manufacturer: 'vivo', model: 'V2109', androidRelease: '13', sdkInt: 33, appVersion: '0.6-test', appVersionCode: 60, batteryPercent: 80 },
    p_sims: [{ subscriptionId: 101, slotIndex: 0, carrierName: 'Ufone', displayName: 'Ufone', countryIso: 'pk', isEmbedded: false, simIdentityHash: simHash }],
  }), 'report inventory')
  const dashboard = assertNoError(await owner.client.rpc('list_gateway_device_dashboard', { p_organization_id: owner.orgId }), 'list device dashboard')
  const sim = dashboard?.[0]?.sims?.[0]
  assert(sim?.simId, 'SIM inventory missing')
  assertNoError(await owner.client.rpc('bind_gateway_device_sim', { p_organization_id: owner.orgId, p_device_id: device.deviceId, p_sim_id: sim.simId }), 'bind exact SIM')
  return sim
}

async function cleanup() {
  for (const orgId of createdOrgs) {
    const result = await admin.from('organizations').delete().eq('id', orgId)
    if (result.error) console.warn(`Cleanup org warning: ${result.error.message}`)
  }
  for (const userId of createdUsers) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup user warning: ${result.error.message}`)
  }
}

try {
  console.log('BulkText 0.16 local Durable Cloud Queue acceptance')
  console.log(`Target: ${parsedUrl.origin}`)
  const schema = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema meta')
  assert(schema?.value?.version === '0.16.0', `Expected 0.16.0 schema, got ${JSON.stringify(schema?.value)}`)
  assert(schema.value.campaign_send_enabled === false, '0.16 must not enable SMS sending')
  console.log('✓ 0.16 schema present; SMS sending remains disabled')

  const owner = await createUser('owner')
  const outsider = await createUser('outsider')
  const ownerDevice = await pairDevice(owner, `owner-${stamp}`)
  const outsiderDevice = await pairDevice(outsider, `outsider-${stamp}`)
  const simHash = 'a'.repeat(64)
  const sim = await reportAndBind(owner, ownerDevice, simHash)
  await reportAndBind(outsider, outsiderDevice, 'b'.repeat(64))
  console.log('✓ Two tenant-isolated gateway credentials created')

  const phones = ['+923001234567', '+923111234567', '+923221234567']
  for (const phone of phones) {
    assertNoError(await owner.client.rpc('record_contact_consent', {
      p_organization_id: owner.orgId, p_phone: phone, p_event_type: 'granted', p_source: 'manual',
      p_evidence_note: '0.16 queue acceptance', p_evidence_reference: null, p_occurred_at: null, p_expires_at: null,
    }), `grant consent ${phone}`)
  }

  const campaignId = crypto.randomUUID()
  const confirmedAt = new Date().toISOString()
  assertNoError(await admin.from('campaigns').insert({
    id: campaignId, organization_id: owner.orgId, source_draft_id: null, source_draft_updated_at: confirmedAt,
    source_eligibility_snapshot_id: null, source_recipient_preview_id: null, title: '0.16 queue fixture',
    message_template_snapshot: 'Hello queue', template_syntax_version: 'mustache-v1', template_variables: [],
    eligibility_policy_version: 'consent-suppression-v1', sms_segment_model_version: 'gsm7-ucs2-v1',
    recipient_count: 3, estimated_sms_units: 3, gsm7_recipients: 3, unicode_recipients: 0,
    minimum_segments: 1, maximum_segments: 1, average_segments: 1,
    gateway_device_id_snapshot: ownerDevice.deviceId, gateway_device_name: 'Queue Gateway', gateway_manufacturer: 'vivo', gateway_model: 'V2109',
    gateway_last_seen_at: confirmedAt, gateway_last_inventory_at: confirmedAt, gateway_sim_id_snapshot: sim.simId,
    sim_subscription_id: 101, sim_slot_index: 0, sim_carrier_name: 'Ufone', sim_display_name: 'Ufone', sim_identity_hash: simHash,
    recipient_limit_snapshot: 5000, confirmed_by: owner.user.id, confirmed_at: confirmedAt,
  }), 'insert immutable campaign')
  assertNoError(await admin.from('campaign_recipients').insert(phones.map((phone, index) => ({
    campaign_id: campaignId, organization_id: owner.orgId, source_row_number: index + 2, display_name: `Recipient ${index + 1}`,
    normalized_e164: phone, rendered_message: `Hello Recipient ${index + 1}`, sms_encoding: 'GSM-7', character_count: 17,
    encoding_units: 17, segment_count: 1, eligibility_state: 'eligible', consent_state: 'granted', consent_source: 'manual',
    consent_occurred_at: confirmedAt, suppression_state: 'clear',
  }))), 'insert immutable campaign recipients')
  console.log('✓ Immutable three-recipient campaign fixture created')

  const preflight = assertNoError(await owner.client.rpc('get_campaign_send_preflight', { p_organization_id: owner.orgId, p_campaign_id: campaignId }), 'preflight')?.[0]
  assert(preflight?.ready === true, `Expected ready preflight: ${JSON.stringify(preflight)}`)
  const authorization = assertNoError(await owner.client.rpc('authorize_campaign_send', { p_organization_id: owner.orgId, p_campaign_id: campaignId }), 'authorize')?.[0]
  assert(authorization?.authorization_id, 'Authorization missing')

  const dispatch = assertNoError(await owner.client.rpc('enqueue_campaign_dispatch', {
    p_organization_id: owner.orgId, p_campaign_id: campaignId, p_authorization_id: authorization.authorization_id,
  }), 'enqueue')?.[0]
  assert(dispatch?.created === true && dispatch.queued_jobs === 3, `Unexpected dispatch: ${JSON.stringify(dispatch)}`)
  const duplicate = assertNoError(await owner.client.rpc('enqueue_campaign_dispatch', {
    p_organization_id: owner.orgId, p_campaign_id: campaignId, p_authorization_id: authorization.authorization_id,
  }), 'idempotent enqueue retry')?.[0]
  assert(duplicate?.created === false && duplicate.dispatch_id === dispatch.dispatch_id, 'Duplicate enqueue did not return existing dispatch')
  console.log('✓ Fresh authorization consumed atomically; duplicate enqueue is idempotent')

  const latest = assertNoError(await owner.client.rpc('get_latest_campaign_send_authorization', { p_organization_id: owner.orgId, p_campaign_id: campaignId }), 'latest authorization')?.[0]
  assert(latest?.status === 'consumed', `Expected consumed authorization, got ${latest?.status}`)
  const extraAuthorization = await owner.client.rpc('authorize_campaign_send', { p_organization_id: owner.orgId, p_campaign_id: campaignId })
  assert(extraAuthorization.error, 'Campaign with a dispatch unexpectedly received another authorization')

  const outsiderClaim = assertNoError(await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: outsiderDevice.deviceId, p_credential: outsiderDevice.credential, p_limit: 25 }), 'outsider claim')
  assert(Array.isArray(outsiderClaim) && outsiderClaim.length === 0, 'Other tenant device unexpectedly received queue jobs')
  const wrongCredential = await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: ownerDevice.deviceId, p_credential: 'btg_wrong_credential_12345678901234567890', p_limit: 25 })
  assert(wrongCredential.error, 'Wrong device credential unexpectedly claimed queue jobs')
  console.log('✓ Device credential and tenant boundaries protect job claims')

  const leased = assertNoError(await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential, p_limit: 2 }), 'claim owner jobs')
  assert(leased.length === 2 && leased.every((job) => job.lease_version === 1), 'Expected two first-version leases')
  assert(leased.every((job) => job.sim_identity_hash === simHash && job.sim_subscription_id === 101 && job.sim_slot_index === 0), 'Lease did not freeze exact SIM identity')
  console.log('✓ Bounded lease returns exact frozen SIM identity and immutable jobs')

  assertNoError(await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_device: { manufacturer: 'vivo', model: 'V2109' }, p_sims: [],
  }), 'report missing bound SIM')
  const blockedClaim = await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential, p_limit: 1 })
  assert(blockedClaim.error, 'Missing bound SIM should block claiming the still-queued job')

  const first = leased[0]
  const acked = assertNoError(await anonymous.rpc('acknowledge_gateway_message_jobs', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_receipts: [{ jobId: first.job_id, leaseToken: first.lease_token, leaseVersion: first.lease_version }],
  }), 'ACK durable local persistence')
  assert(acked === 1, 'Expected one ACK')
  const ackRetry = assertNoError(await anonymous.rpc('acknowledge_gateway_message_jobs', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_receipts: [{ jobId: first.job_id, leaseToken: first.lease_token, leaseVersion: first.lease_version }],
  }), 'idempotent ACK retry')
  assert(ackRetry === 1, 'Idempotent ACK retry failed')
  console.log('✓ Durable download ACK is idempotent and does not depend on SIM remaining present after lease')

  const second = leased[1]
  const released = assertNoError(await anonymous.rpc('release_gateway_message_job_leases', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_receipts: [{ jobId: second.job_id, leaseToken: second.lease_token, leaseVersion: second.lease_version }],
  }), 'release unpersisted lease')
  assert(released === 1, 'Expected one released lease')

  await reportAndBind(owner, ownerDevice, simHash)
  const reclaimed = assertNoError(await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential, p_limit: 3 }), 'claim released plus previously queued jobs')
  assert(reclaimed.length === 2, `Expected released + queued jobs, got ${reclaimed.length}`)
  const reclaimedSecond = reclaimed.find((job) => job.job_id === second.job_id)
  const third = reclaimed.find((job) => job.job_id !== second.job_id)
  assert(reclaimedSecond?.lease_version === 2, 'Released job was not reclaimed with lease version 2')
  assert(third?.lease_version === 1, 'Previously unclaimed job should start at lease version 1')
  assertNoError(await anonymous.rpc('acknowledge_gateway_message_jobs', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_receipts: [{ jobId: reclaimedSecond.job_id, leaseToken: reclaimedSecond.lease_token, leaseVersion: reclaimedSecond.lease_version }],
  }), 'ACK released/reclaimed job')

  const expiredLease = await admin.from('campaign_message_jobs').update({
    leased_at: new Date(Date.now() - 180_000).toISOString(),
    lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
  }).eq('id', third.job_id)
  assertNoError(expiredLease, 'force one lease expired for recovery fixture')
  const recoveredExpired = assertNoError(await anonymous.rpc('claim_gateway_message_jobs', { p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential, p_limit: 1 }), 'recover expired lease')
  assert(recoveredExpired.length === 1 && recoveredExpired[0].job_id === third.job_id && recoveredExpired[0].lease_version === 2, 'Expired lease was not safely requeued with an advanced version')
  assertNoError(await anonymous.rpc('acknowledge_gateway_message_jobs', {
    p_device_id: ownerDevice.deviceId, p_credential: ownerDevice.credential,
    p_receipts: [{ jobId: recoveredExpired[0].job_id, leaseToken: recoveredExpired[0].lease_token, leaseVersion: recoveredExpired[0].lease_version }],
  }), 'ACK expired/recovered job')
  console.log('✓ Explicit release and expired-lease recovery both advance lease version safely')

  const status = assertNoError(await owner.client.rpc('get_campaign_dispatch', { p_organization_id: owner.orgId, p_campaign_id: campaignId }), 'dispatch status')?.[0]
  assert(status?.status === 'downloaded' && status.downloaded_jobs === 3 && status.queued_jobs === 0 && status.leased_jobs === 0, `Unexpected final status: ${JSON.stringify(status)}`)
  const jobs = assertNoError(await admin.from('campaign_message_jobs').select('state').eq('dispatch_id', dispatch.dispatch_id), 'inspect job states')
  assert(jobs.every((job) => job.state === 'downloaded'), 'Final jobs are not all downloaded')
  console.log('✓ All jobs are downloaded/ACKed; no SMS submission state exists in 0.16')

  console.log('\nBulkText 0.16 DURABLE CLOUD QUEUE ACCEPTANCE PASS')
} finally {
  await cleanup()
}
