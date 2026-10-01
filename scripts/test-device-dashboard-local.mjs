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
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run device-dashboard fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
const anonymous = userClient(url, anonKey)
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  owner: `bulktext-070-owner-${stamp}@example.test`,
  other: `bulktext-070-other-${stamp}@example.test`,
  analyst: `bulktext-070-analyst-${stamp}@example.test`,
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
  assert(typeof id === 'string' && id.length > 0, `${name} did not return an organization UUID`)
  createdOrganizationIds.push(id)
  return id
}

async function createPairing(client, orgId) {
  const rows = assertNoError(await client.rpc('create_gateway_pairing_code', { p_organization_id: orgId }), 'create gateway pairing code')
  const pairing = rows?.[0]
  assert(pairing?.pairing_code, 'Pairing code missing')
  return pairing
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

try {
  console.log('BulkText 0.9.0 local device-dashboard/SIM-binding acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.9.0', `Expected schema version 0.9.0, received ${JSON.stringify(schemaMeta?.value)}`)
  console.log('✓ 0.9.0 migration metadata present')

  const [ownerUser, otherUser, analystUser] = await Promise.all([
    createConfirmedUser(emails.owner, 'Device Owner'),
    createConfirmedUser(emails.other, 'Other Owner'),
    createConfirmedUser(emails.analyst, 'Read-only Analyst'),
  ])
  const [owner, other, analyst] = await Promise.all([signIn(emails.owner), signIn(emails.other), signIn(emails.analyst)])
  const orgA = await createOrganization(owner, `Device A ${stamp}`)
  const orgB = await createOrganization(other, `Device B ${stamp}`)
  assertNoError(await admin.from('organization_members').insert({ organization_id: orgA, user_id: analystUser.id, role: 'analyst' }), 'add analyst fixture')
  console.log('✓ Tenant and role fixtures created')

  const pairing = await createPairing(owner, orgA)
  const claimRows = assertNoError(await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: pairing.pairing_code,
    p_device_name: 'Vivo Y33s Gateway',
    p_installation_id: `vivo-y33s-070-${stamp}`,
  }), 'claim gateway')
  const claim = claimRows?.[0]
  assert(claim?.device_id && claim?.credential, 'Gateway claim did not return device identity')
  const deviceId = claim.device_id
  const credential = claim.credential
  console.log('✓ 0.6 pairing trust boundary remains usable')

  const wrongReport = await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: deviceId,
    p_credential: 'btg_wrong_inventory_credential_1234567890',
    p_device: { manufacturer: 'vivo', model: 'V2109' },
    p_sims: [],
  })
  assert(wrongReport.error, 'Wrong device credential unexpectedly reported inventory')

  const firstReportRows = assertNoError(await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: deviceId,
    p_credential: credential,
    p_device: {
      manufacturer: 'vivo',
      model: 'V2109',
      androidRelease: '13',
      sdkInt: 33,
      appVersion: '0.7.0-test',
      appVersionCode: 70,
      batteryPercent: 82,
    },
    p_sims: [
      { subscriptionId: 101, slotIndex: 0, carrierName: 'Ufone', displayName: 'Ufone SIM', countryIso: 'pk', isEmbedded: false },
      { subscriptionId: 202, slotIndex: 1, carrierName: 'Jazz', displayName: 'Jazz SIM', countryIso: 'pk', isEmbedded: false },
    ],
  }), 'report first device/SIM inventory')
  assert(firstReportRows?.[0]?.binding_status === 'unbound', 'Fresh inventory should be unbound')
  console.log('✓ Device-scoped credential reports hardware and dual-SIM inventory')

  const directAnonSims = await anonymous.from('gateway_device_sims').select('id')
  assert(directAnonSims.error, 'Anonymous client unexpectedly read gateway_device_sims directly')
  const directBrowserBinding = await owner.from('gateway_device_sim_bindings').select('device_id')
  assert(directBrowserBinding.error, 'Authenticated browser unexpectedly read SIM binding table directly')
  console.log('✓ SIM inventory/binding tables remain RPC-only')

  let dashboard = assertNoError(await owner.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'owner dashboard read')
  assert(dashboard.length === 1, 'Owner dashboard did not return the gateway')
  assert(dashboard[0].manufacturer === 'vivo' && dashboard[0].model === 'V2109', 'Device metadata was not persisted')
  assert(dashboard[0].battery_percent === 82, 'Battery state was not persisted')
  assert(Array.isArray(dashboard[0].sims) && dashboard[0].sims.length === 2, 'Dual-SIM inventory was not returned')
  assert(dashboard[0].health_status === 'recent', `Expected recent device health, received ${dashboard[0].health_status}`)

  const analystDashboard = assertNoError(await analyst.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'analyst dashboard read')
  assert(analystDashboard.length === 1, 'Organization analyst could not view device health')
  const crossTenant = await other.rpc('list_gateway_device_dashboard', { p_organization_id: orgA })
  assert(crossTenant.error, 'Other tenant unexpectedly viewed Organization A device dashboard')
  console.log('✓ Dashboard is member-readable and tenant-isolated')

  const jazz = dashboard[0].sims.find((sim) => sim.subscriptionId === 202)
  const ufone = dashboard[0].sims.find((sim) => sim.subscriptionId === 101)
  assert(jazz?.simId && ufone?.simId, 'Expected SIM identities were not returned')

  const analystBind = await analyst.rpc('bind_gateway_device_sim', { p_organization_id: orgA, p_device_id: deviceId, p_sim_id: jazz.simId })
  assert(analystBind.error, 'Analyst unexpectedly changed the selected SIM')
  assertNoError(await owner.rpc('bind_gateway_device_sim', { p_organization_id: orgA, p_device_id: deviceId, p_sim_id: jazz.simId }), 'bind Jazz SIM')
  dashboard = assertNoError(await owner.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'dashboard after Jazz binding')
  assert(dashboard[0].binding_status === 'ready' && dashboard[0].bound_subscription_id === 202, 'Selected Jazz SIM did not become ready')
  console.log('✓ Owner/Admin-only explicit SIM binding becomes ready')

  const secondReportRows = assertNoError(await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: deviceId,
    p_credential: credential,
    p_device: {
      manufacturer: 'vivo', model: 'V2109', androidRelease: '13', sdkInt: 33,
      appVersion: '0.7.0-test', appVersionCode: 70, batteryPercent: 78,
    },
    p_sims: [
      { subscriptionId: 101, slotIndex: 0, carrierName: 'Ufone', displayName: 'Ufone SIM', countryIso: 'pk', isEmbedded: false },
    ],
  }), 'report inventory with selected SIM removed')
  assert(secondReportRows?.[0]?.binding_status === 'missing', 'Removed selected SIM did not become missing')
  assert(secondReportRows[0].bound_subscription_id === 202, 'Binding silently moved away from the missing selected SIM')
  dashboard = assertNoError(await owner.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'dashboard with missing selected SIM')
  assert(dashboard[0].binding_status === 'missing' && dashboard[0].bound_subscription_id === 202, 'Dashboard did not preserve missing selected SIM identity')
  assert(dashboard[0].sims.find((sim) => sim.subscriptionId === 101)?.present === true, 'Remaining SIM should be present')
  assert(dashboard[0].sims.find((sim) => sim.subscriptionId === 202)?.present === false, 'Removed SIM should be marked absent')
  console.log('✓ Missing selected SIM is blocked; no silent fallback to another subscription')

  const missingBind = await owner.rpc('bind_gateway_device_sim', { p_organization_id: orgA, p_device_id: deviceId, p_sim_id: jazz.simId })
  assert(missingBind.error, 'Absent SIM was unexpectedly accepted as a new binding')
  assertNoError(await owner.rpc('bind_gateway_device_sim', { p_organization_id: orgA, p_device_id: deviceId, p_sim_id: ufone.simId }), 'rebind present Ufone SIM')
  dashboard = assertNoError(await owner.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'dashboard after Ufone rebind')
  assert(dashboard[0].binding_status === 'ready' && dashboard[0].bound_subscription_id === 101, 'Present Ufone SIM did not become ready')

  assertNoError(await owner.rpc('clear_gateway_device_sim_binding', { p_organization_id: orgA, p_device_id: deviceId }), 'clear selected SIM')
  dashboard = assertNoError(await owner.rpc('list_gateway_device_dashboard', { p_organization_id: orgA }), 'dashboard after clearing SIM')
  assert(dashboard[0].binding_status === 'unbound' && dashboard[0].bound_sim_id === null, 'Cleared device still has a binding')
  console.log('✓ Present SIM can be re-bound and binding can be explicitly cleared')

  const auditRows = assertNoError(await owner.from('audit_logs').select('action').eq('organization_id', orgA), 'read device/SIM audit')
  const actions = new Set(auditRows.map((row) => row.action))
  assert(actions.has('gateway.sim_bound') && actions.has('gateway.sim_unbound'), 'SIM binding audit events are incomplete')
  console.log('✓ SIM binding changes are represented in the audit ledger')

  assertNoError(await owner.rpc('revoke_gateway_device', { p_organization_id: orgA, p_device_id: deviceId }), 'revoke gateway')
  const reportAfterRevoke = await anonymous.rpc('report_gateway_device_inventory', {
    p_device_id: deviceId,
    p_credential: credential,
    p_device: { manufacturer: 'vivo', model: 'V2109' },
    p_sims: [],
  })
  assert(reportAfterRevoke.error, 'Revoked gateway unexpectedly reported inventory')
  console.log('✓ Revocation immediately blocks inventory reporting')

  const orgBDashboard = assertNoError(await other.rpc('list_gateway_device_dashboard', { p_organization_id: orgB }), 'other tenant own dashboard')
  assert(orgBDashboard.length === 0, 'Other tenant unexpectedly contains gateway state')
  assert(ownerUser.id && otherUser.id, 'User fixtures were not created')

  console.log('\nBulkText 0.9.0 DEVICE DASHBOARD & SIM BINDING REGRESSION PASS')
} finally {
  await cleanup()
}
