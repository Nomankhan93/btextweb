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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
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
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) {
  throw new Error(`Refusing to run RBAC fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
}
if (parsedUrl.port && parsedUrl.port !== '56321') {
  throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const password = `BulkText-${stamp}-Aa1!`
const emails = {
  a: `bulktext-051-a-${stamp}@example.test`,
  b: `bulktext-051-b-${stamp}@example.test`,
  c: `bulktext-051-c-${stamp}@example.test`,
  wrong: `bulktext-051-wrong-${stamp}@example.test`,
}

const createdUserIds = []
const createdOrganizationIds = []

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

async function createOrganization(client, name) {
  const data = assertNoError(await client.rpc('create_organization', { p_name: name }), `create ${name}`)
  assert(typeof data === 'string' && data.length > 0, `${name} did not return an organization UUID`)
  createdOrganizationIds.push(data)
  return data
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
  console.log('BulkText 0.12.0 RBAC regression acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.12.0', `Expected schema version 0.12.0, received ${JSON.stringify(schemaMeta?.value)}`)
  console.log('✓ 0.12.0 migration metadata present')

  const [userA, userB, userC] = await Promise.all([
    createConfirmedUser(emails.a, 'RBAC User A'),
    createConfirmedUser(emails.b, 'RBAC User B'),
    createConfirmedUser(emails.c, 'RBAC User C'),
  ])
  const [clientA, clientB, clientC] = await Promise.all([signIn(emails.a), signIn(emails.b), signIn(emails.c)])
  console.log('✓ Three isolated authenticated fixtures created')

  const orgA = await createOrganization(clientA, `RBAC A ${stamp}`)
  const orgB = await createOrganization(clientB, `RBAC B ${stamp}`)

  const myA = assertNoError(await clientA.rpc('list_my_organizations'), 'list A organizations')
  const myB = assertNoError(await clientB.rpc('list_my_organizations'), 'list B organizations')
  assert(myA.length === 1 && myA[0].organization_id === orgA && myA[0].role === 'owner', 'User A was not returned as Owner of Organization A')
  assert(myB.length === 1 && myB[0].organization_id === orgB && myB[0].role === 'owner', 'User B was not returned as Owner of Organization B')
  console.log('✓ create_organization + Owner membership + list_my_organizations')

  const visibleBToA = assertNoError(await clientA.from('organizations').select('id').eq('id', orgB), 'A organization isolation query')
  const visibleAToB = assertNoError(await clientB.from('organizations').select('id').eq('id', orgA), 'B organization isolation query')
  assert(visibleBToA.length === 0, 'User A can read Organization B before membership')
  assert(visibleAToB.length === 0, 'User B can read Organization A before membership')

  const bProfileBefore = assertNoError(await clientA.from('profiles').select('id').eq('id', userB.id), 'profile isolation before shared membership')
  assert(bProfileBefore.length === 0, 'User A can read User B profile without shared organization')
  console.log('✓ Cross-tenant organization/profile reads blocked by RLS')

  const directOrgInsert = await clientA.from('organizations').insert({
    name: `Forbidden ${stamp}`,
    slug: `forbidden-${stamp}`,
    created_by: userA.id,
  }).select('id')
  assert(directOrgInsert.error, 'Authenticated client unexpectedly inserted an organization directly')

  const directMemberInsert = await clientA.from('organization_members').insert({
    organization_id: orgB,
    user_id: userA.id,
    role: 'admin',
  })
  assert(directMemberInsert.error, 'Authenticated client unexpectedly inserted membership directly')
  console.log('✓ Sensitive direct writes remain RPC-only')

  const roleA = assertNoError(await clientA.rpc('org_role', { p_organization_id: orgA }), 'safe org_role A')
  assert(roleA === 'owner', `Expected owner role for A, got ${String(roleA)}`)
  const forbiddenArbitraryRole = await clientA.rpc('org_role', { p_organization_id: orgA, p_user_id: userB.id })
  assert(forbiddenArbitraryRole.error, 'Legacy arbitrary-user org_role signature is still callable')
  console.log('✓ Public RBAC helpers are current-user scoped')

  const inviteForBRows = assertNoError(await clientA.rpc('create_organization_invitation', {
    p_organization_id: orgA,
    p_email: emails.b,
    p_role: 'analyst',
  }), 'Owner A invitation for B')
  const inviteForB = inviteForBRows?.[0]
  assert(inviteForB?.invite_token, 'Invitation token for B was not returned')

  const wrongInviteRows = assertNoError(await clientA.rpc('create_organization_invitation', {
    p_organization_id: orgA,
    p_email: emails.wrong,
    p_role: 'billing',
  }), 'Owner A wrong-email invitation')
  const wrongInvite = wrongInviteRows?.[0]
  assert(wrongInvite?.invite_token, 'Wrong-email test invitation token was not returned')

  const wrongAccept = await clientC.rpc('accept_organization_invitation', { p_token: wrongInvite.invite_token })
  assert(wrongAccept.error, 'A user with the wrong email unexpectedly accepted an invitation')
  console.log('✓ Invitation acceptance is bound to authenticated email')

  const acceptedOrg = assertNoError(await clientB.rpc('accept_organization_invitation', { p_token: inviteForB.invite_token }), 'B accepts A invitation')
  assert(acceptedOrg === orgA, 'Invitation acceptance returned the wrong organization')
  const duplicateAccept = await clientB.rpc('accept_organization_invitation', { p_token: inviteForB.invite_token })
  assert(duplicateAccept.error, 'Invitation was accepted twice')

  const bMemberships = assertNoError(await clientB.rpc('list_my_organizations'), 'B organizations after acceptance')
  const bInA = bMemberships.find((row) => row.organization_id === orgA)
  assert(bInA?.role === 'analyst', 'User B did not join Organization A as analyst')
  const bProfileAfter = assertNoError(await clientA.from('profiles').select('id').eq('id', userB.id), 'profile visibility after shared membership')
  assert(bProfileAfter.length === 1, 'User A cannot read User B profile after shared membership')
  console.log('✓ Membership acceptance updates tenant visibility')

  const analystInvite = await clientB.rpc('create_organization_invitation', {
    p_organization_id: orgA,
    p_email: emails.c,
    p_role: 'billing',
  })
  assert(analystInvite.error, 'Analyst unexpectedly created an invitation')

  assertNoError(await clientA.rpc('set_organization_member_role', {
    p_organization_id: orgA,
    p_user_id: userB.id,
    p_role: 'admin',
  }), 'Owner promotes B to admin')

  const ownerDemotion = await clientB.rpc('set_organization_member_role', {
    p_organization_id: orgA,
    p_user_id: userA.id,
    p_role: 'analyst',
  })
  assert(ownerDemotion.error, 'Owner was unexpectedly demoted')

  const ownerRemoval = await clientB.rpc('remove_organization_member', {
    p_organization_id: orgA,
    p_user_id: userA.id,
  })
  assert(ownerRemoval.error, 'Owner was unexpectedly removed')

  const adminInviteRows = assertNoError(await clientB.rpc('create_organization_invitation', {
    p_organization_id: orgA,
    p_email: emails.c,
    p_role: 'billing',
  }), 'Admin B invitation for C')
  assert(adminInviteRows?.[0]?.invitation_id, 'Admin invitation was not created')
  assertNoError(await clientB.rpc('revoke_organization_invitation', {
    p_invitation_id: adminInviteRows[0].invitation_id,
  }), 'Admin B revokes C invitation')
  console.log('✓ Owner/Admin RBAC works; owner remains protected')

  assertNoError(await clientA.rpc('remove_organization_member', {
    p_organization_id: orgA,
    p_user_id: userB.id,
  }), 'Owner A removes B')

  const bAfterRemoval = assertNoError(await clientB.from('organizations').select('id').eq('id', orgA), 'B isolation after removal')
  assert(bAfterRemoval.length === 0, 'Removed User B can still read Organization A')
  const bProfileAfterRemoval = assertNoError(await clientA.from('profiles').select('id').eq('id', userB.id), 'profile isolation after membership removal')
  assert(bProfileAfterRemoval.length === 0, 'User A can still read User B profile without a shared organization')
  console.log('✓ Removal immediately restores tenant isolation')

  const auditRows = assertNoError(await clientA.from('audit_logs').select('action').eq('organization_id', orgA), 'Owner A audit read')
  const actions = new Set(auditRows.map((row) => row.action))
  for (const expected of ['organization.created', 'organization.invitation_created', 'organization.invitation_accepted', 'organization.member_role_changed', 'organization.member_removed']) {
    assert(actions.has(expected), `Missing expected audit action ${expected}`)
  }
  console.log('✓ Organization lifecycle audit trail recorded')

  const cOrganizations = assertNoError(await clientC.rpc('list_my_organizations'), 'C organization list')
  assert(cOrganizations.length === 0, 'User C unexpectedly belongs to an organization')

  console.log('\nBulkText 0.12.0 RBAC REGRESSION PASS')
} finally {
  await cleanup()
}
