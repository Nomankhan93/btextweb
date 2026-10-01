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
  return parseEnv(execFileSync(npx, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }))
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
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  a: `bulktext-0121-a-${stamp}@example.test`,
  b: `bulktext-0121-b-${stamp}@example.test`,
}
const createdUserIds = []
const createdWorkspaceIds = []

async function createConfirmedUser(email, displayName) {
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
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

async function personalWorkspace(client, label) {
  const rows = assertNoError(await client.rpc('get_my_personal_workspace'), `get ${label} personal workspace`)
  const row = rows?.[0]
  assert(row?.workspace_id, `${label} personal workspace was not returned`)
  if (!createdWorkspaceIds.includes(row.workspace_id)) createdWorkspaceIds.push(row.workspace_id)
  return row
}

async function cleanup() {
  if (createdWorkspaceIds.length) {
    const result = await admin.from('organizations').delete().in('id', createdWorkspaceIds)
    if (result.error) console.warn(`Cleanup warning (workspaces): ${result.error.message}`)
  }
  for (const userId of createdUserIds) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup warning (user ${userId}): ${result.error.message}`)
  }
}

try {
  console.log('BulkText 0.13.0 Individual Account Transition acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.13.0', `Expected schema version 0.13.0, received ${JSON.stringify(schemaMeta?.value)}`)
  assert(schemaMeta?.value?.tenant_model === 'hidden_personal_workspace', 'Hidden personal workspace metadata is missing')
  console.log('✓ 0.13.0 schema metadata present')

  const [userA, userB] = await Promise.all([
    createConfirmedUser(emails.a, 'Individual A'),
    createConfirmedUser(emails.b, 'Individual B'),
  ])
  const [clientA, clientB] = await Promise.all([signIn(emails.a), signIn(emails.b)])
  console.log('✓ Authenticated individual fixtures created')

  const workspaceA = await personalWorkspace(clientA, 'A')
  const workspaceB = await personalWorkspace(clientB, 'B')
  assert(workspaceA.workspace_id !== workspaceB.workspace_id, 'Two users unexpectedly share one personal workspace')

  const [profileA, profileB] = await Promise.all([
    admin.from('profiles').select('id,personal_workspace_id').eq('id', userA.id).single(),
    admin.from('profiles').select('id,personal_workspace_id').eq('id', userB.id).single(),
  ])
  assertNoError(profileA, 'read A profile as service role')
  assertNoError(profileB, 'read B profile as service role')
  assert(profileA.data.personal_workspace_id === workspaceA.workspace_id, 'A profile is not bound to workspace A')
  assert(profileB.data.personal_workspace_id === workspaceB.workspace_id, 'B profile is not bound to workspace B')

  const memberships = assertNoError(await admin.from('organization_members').select('organization_id,user_id,role').in('organization_id', [workspaceA.workspace_id, workspaceB.workspace_id]), 'read owner memberships')
  assert(memberships.some((row) => row.organization_id === workspaceA.workspace_id && row.user_id === userA.id && row.role === 'owner'), 'A is not internal Owner of workspace A')
  assert(memberships.some((row) => row.organization_id === workspaceB.workspace_id && row.user_id === userB.id && row.role === 'owner'), 'B is not internal Owner of workspace B')
  console.log('✓ Personal workspace + hidden Owner membership auto-provisioned')

  const workspaceAAgain = await personalWorkspace(clientA, 'A repeat')
  assert(workspaceAAgain.workspace_id === workspaceA.workspace_id, 'Personal workspace provisioning is not idempotent')
  console.log('✓ Personal workspace provisioning is idempotent')

  const ownProfile = assertNoError(await clientA.from('profiles').select('id,display_name').eq('id', userA.id), 'A reads own profile')
  const otherProfile = assertNoError(await clientA.from('profiles').select('id').eq('id', userB.id), 'A tests B profile isolation')
  assert(ownProfile.length === 1, 'A cannot read own profile')
  assert(otherProfile.length === 0, 'A can read B profile')
  console.log('✓ Profile RLS is self-only')

  const crossWorkspaceDevices = await clientA.rpc('list_gateway_device_dashboard', { p_organization_id: workspaceB.workspace_id })
  assert(crossWorkspaceDevices.error, 'A unexpectedly accessed B device dashboard')
  console.log('✓ Existing tenant-scoped device RPCs still isolate users')

  const directOrganizations = await clientA.from('organizations').select('id')
  assert(directOrganizations.error, 'Individual web client unexpectedly has direct organization table access')
  const directMembers = await clientA.from('organization_members').select('organization_id')
  assert(directMembers.error, 'Individual web client unexpectedly has direct organization membership access')
  console.log('✓ Internal tenant tables are no longer exposed to normal web clients')

  const createOrg = await clientA.rpc('create_organization', { p_name: `Forbidden ${stamp}` })
  assert(createOrg.error, 'Individual user unexpectedly created another organization')
  const listOrgs = await clientA.rpc('list_my_organizations')
  assert(listOrgs.error, 'Individual user unexpectedly accessed the old organization switcher RPC')
  const invite = await clientA.rpc('create_organization_invitation', {
    p_organization_id: workspaceA.workspace_id,
    p_email: emails.b,
    p_role: 'admin',
  })
  assert(invite.error, 'Individual user unexpectedly created a team invitation')
  console.log('✓ Multi-organization and team RPCs are disabled')

  assertNoError(await admin.from('profiles').update({ personal_workspace_id: null }).eq('id', userA.id), 'clear A workspace link for repair test')
  const repaired = assertNoError(await clientA.rpc('ensure_personal_workspace'), 'repair A personal workspace')
  assert(repaired === workspaceA.workspace_id, 'Repair did not adopt A existing owned workspace')
  const repairedProfile = assertNoError(await admin.from('profiles').select('personal_workspace_id').eq('id', userA.id).single(), 'read repaired profile')
  assert(repairedProfile.personal_workspace_id === workspaceA.workspace_id, 'Repair did not persist personal workspace link')
  console.log('✓ Missing profile link repairs by adopting existing owned data')

  console.log('\nBulkText 0.13.0 INDIVIDUAL ACCOUNT TRANSITION PASS')
} finally {
  await cleanup()
}
