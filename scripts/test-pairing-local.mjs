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
  const output = execFileSync(npx, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon/publishable key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')

const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run pairing fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const anonymous = userClient(url, anonKey)

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  a: `bulktext-060-a-${stamp}@example.test`,
  b: `bulktext-060-b-${stamp}@example.test`,
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
  assert(pairing?.pairing_id, 'Pairing ID was not returned')
  assert(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(pairing.pairing_code), `Unexpected pairing code format: ${pairing?.pairing_code}`)
  assert(pairing.pairing_uri === `bulktext://pair?code=${pairing.pairing_code}`, 'Pairing URI did not match the code')
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
  console.log('BulkText 0.10.0 secure-pairing regression acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.10.0', `Expected schema version 0.10.0, received ${JSON.stringify(schemaMeta?.value)}`)
  console.log('✓ 0.10.0 migration metadata present')

  await Promise.all([
    createConfirmedUser(emails.a, 'Pairing Owner A'),
    createConfirmedUser(emails.b, 'Pairing Owner B'),
  ])
  const [clientA, clientB] = await Promise.all([signIn(emails.a), signIn(emails.b)])
  const orgA = await createOrganization(clientA, `Pairing A ${stamp}`)
  const orgB = await createOrganization(clientB, `Pairing B ${stamp}`)
  console.log('✓ Isolated organization fixtures created')

  const pairing = await createPairing(clientA, orgA)
  const expiryMs = new Date(pairing.expires_at).getTime() - Date.now()
  assert(expiryMs > 8 * 60_000 && expiryMs <= 11 * 60_000, `Pairing expiry is outside the expected 10-minute window: ${expiryMs}ms`)

  const storedPairing = assertNoError(await admin.from('gateway_pairing_codes').select('code_hash').eq('id', pairing.pairing_id).single(), 'inspect stored pairing hash')
  assert(storedPairing.code_hash !== pairing.pairing_code, 'Raw pairing code was persisted instead of a hash')
  assert(/^[0-9a-f]{64}$/.test(storedPairing.code_hash), 'Pairing code hash is not a SHA-256 hex digest')
  console.log('✓ One-use pairing code generated; only its hash is stored')

  const crossTenantPairing = await clientB.rpc('create_gateway_pairing_code', { p_organization_id: orgA })
  assert(crossTenantPairing.error, 'Owner B unexpectedly generated a code for Organization A')
  console.log('✓ Pairing generation is Owner/Admin tenant-scoped')

  const invalidClaim = await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: 'ZZZZZZZZZZZZ',
    p_device_name: 'Invalid Gateway',
    p_installation_id: `invalid-install-${stamp}`,
  })
  assert(invalidClaim.error, 'Invalid pairing code unexpectedly claimed a device')

  const installationId = `vivo-y33s-installation-${stamp}`
  const claimRows = assertNoError(await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: pairing.pairing_code,
    p_device_name: 'Vivo Y33s Gateway',
    p_installation_id: installationId,
  }), 'claim valid pairing code')
  const claim = claimRows?.[0]
  assert(claim?.device_id, 'Pairing claim did not return a device ID')
  assert(claim.organization_id === orgA, 'Pairing claim bound the device to the wrong organization')
  assert(claim.credential?.startsWith('btg_') && claim.credential.length > 60, 'Device credential was not returned')
  assert(claim.credential_version === 1, 'Initial credential version should be 1')
  const firstCredential = claim.credential
  const deviceId = claim.device_id

  const storedCredential = assertNoError(await admin.from('gateway_device_credentials').select('secret_hash, version').eq('device_id', deviceId).single(), 'inspect stored credential hash')
  assert(storedCredential.secret_hash !== firstCredential, 'Raw gateway credential was persisted instead of a hash')
  assert(/^[0-9a-f]{64}$/.test(storedCredential.secret_hash), 'Gateway credential hash is not a SHA-256 hex digest')
  assert(storedCredential.version === 1, 'Stored credential version should be 1')

  const reusedClaim = await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: pairing.pairing_code,
    p_device_name: 'Second Gateway',
    p_installation_id: `second-install-${stamp}`,
  })
  assert(reusedClaim.error, 'A pairing code was reused after its first successful claim')
  console.log('✓ Anonymous Android claim works once; raw device credential is returned once and hashed at rest')

  const directAnonRead = await anonymous.from('gateway_devices').select('id').eq('id', deviceId)
  assert(directAnonRead.error, 'Anonymous client unexpectedly read the gateway_devices table directly')
  const directAuthenticatedInsert = await clientA.from('gateway_devices').insert({
    organization_id: orgA,
    display_name: 'Forbidden direct insert',
    installation_fingerprint_hash: 'forbidden',
  })
  assert(directAuthenticatedInsert.error, 'Authenticated browser unexpectedly inserted a gateway directly')
  console.log('✓ Gateway tables are RPC-only; no direct browser/anon table access')

  const aDevices = assertNoError(await clientA.rpc('list_gateway_devices', { p_organization_id: orgA }), 'Owner A lists gateways')
  assert(aDevices.length === 1 && aDevices[0].device_id === deviceId && aDevices[0].status === 'active', 'Owner A did not see the paired active device')
  const bListsA = await clientB.rpc('list_gateway_devices', { p_organization_id: orgA })
  assert(bListsA.error, 'Owner B unexpectedly listed Organization A gateways')
  console.log('✓ Device listing is tenant-isolated')

  const wrongAuth = await anonymous.rpc('authenticate_gateway_device', { p_device_id: deviceId, p_credential: 'btg_wrong_credential_value_1234567890' })
  assert(wrongAuth.error, 'Wrong gateway credential unexpectedly authenticated')
  const validAuthRows = assertNoError(await anonymous.rpc('authenticate_gateway_device', { p_device_id: deviceId, p_credential: firstCredential }), 'authenticate gateway credential v1')
  assert(validAuthRows?.[0]?.organization_id === orgA && validAuthRows[0].credential_version === 1, 'Valid gateway credential did not authenticate with the expected scope')
  console.log('✓ Device-scoped credential authenticates without a user session')

  const wrongRotate = await anonymous.rpc('rotate_gateway_device_credential', { p_device_id: deviceId, p_current_credential: 'btg_wrong_rotate_value_1234567890' })
  assert(wrongRotate.error, 'Wrong credential unexpectedly rotated the gateway secret')
  const rotateRows = assertNoError(await anonymous.rpc('rotate_gateway_device_credential', { p_device_id: deviceId, p_current_credential: firstCredential }), 'rotate gateway credential')
  const rotated = rotateRows?.[0]
  assert(rotated?.credential_version === 2 && rotated.credential?.startsWith('btg_'), 'Credential rotation did not return version 2')
  const secondCredential = rotated.credential
  const oldAfterRotate = await anonymous.rpc('authenticate_gateway_device', { p_device_id: deviceId, p_credential: firstCredential })
  assert(oldAfterRotate.error, 'Old credential still authenticated after rotation')
  const newAfterRotate = assertNoError(await anonymous.rpc('authenticate_gateway_device', { p_device_id: deviceId, p_credential: secondCredential }), 'authenticate rotated credential')
  assert(newAfterRotate?.[0]?.credential_version === 2, 'Rotated credential did not authenticate as version 2')
  console.log('✓ Credential rotation revokes the old secret immediately')

  const revokedPairing = await createPairing(clientA, orgA)
  assertNoError(await clientA.rpc('revoke_gateway_pairing_code', { p_pairing_id: revokedPairing.pairing_id }), 'revoke pending pairing code')
  const revokedClaim = await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: revokedPairing.pairing_code,
    p_device_name: 'Revoked Pairing Gateway',
    p_installation_id: `revoked-install-${stamp}`,
  })
  assert(revokedClaim.error, 'Revoked pairing code unexpectedly claimed a device')

  const expiredPairing = await createPairing(clientA, orgA)
  const forceExpired = await admin.from('gateway_pairing_codes').update({
    created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    expires_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  }).eq('id', expiredPairing.pairing_id)
  assertNoError(forceExpired, 'force local expiry fixture')
  const expiredClaim = await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: expiredPairing.pairing_code,
    p_device_name: 'Expired Pairing Gateway',
    p_installation_id: `expired-install-${stamp}`,
  })
  assert(expiredClaim.error, 'Expired pairing code unexpectedly claimed a device')
  console.log('✓ Revoked and expired pairing codes are rejected')

  assertNoError(await clientA.rpc('revoke_gateway_device', { p_organization_id: orgA, p_device_id: deviceId }), 'revoke active gateway')
  const afterRevoke = await anonymous.rpc('authenticate_gateway_device', { p_device_id: deviceId, p_credential: secondCredential })
  assert(afterRevoke.error, 'Revoked gateway credential still authenticated')
  console.log('✓ Web revocation disables the device credential immediately')

  const rePair = await createPairing(clientA, orgA)
  const rePairRows = assertNoError(await anonymous.rpc('claim_gateway_pairing', {
    p_pairing_code: rePair.pairing_code,
    p_device_name: 'Vivo Y33s Gateway Repaired',
    p_installation_id: installationId,
  }), 're-pair revoked installation')
  assert(rePairRows?.[0]?.device_id && rePairRows[0].device_id !== deviceId, 'Revoked installation could not be securely re-paired')
  console.log('✓ Revoked installation can be explicitly paired again with a new one-use code')

  const auditRows = assertNoError(await clientA.from('audit_logs').select('action').eq('organization_id', orgA), 'Owner A gateway audit read')
  const actions = new Set(auditRows.map((row) => row.action))
  for (const expected of ['gateway.pairing_created', 'gateway.device_paired', 'gateway.credential_rotated', 'gateway.pairing_revoked', 'gateway.device_revoked']) {
    assert(actions.has(expected), `Missing expected gateway audit action ${expected}`)
  }
  console.log('✓ Pairing, rotation and revocation are represented in the organization audit ledger')

  const orgBDevices = assertNoError(await clientB.rpc('list_gateway_devices', { p_organization_id: orgB }), 'Owner B lists own empty gateway inventory')
  assert(orgBDevices.length === 0, 'Organization B unexpectedly contains gateway devices')

  console.log('\nBulkText 0.10.0 SECURE PAIRING REGRESSION PASS')
} finally {
  await cleanup()
}
