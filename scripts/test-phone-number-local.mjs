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

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}

const discovered = discoverLocalSupabase()
const url = required(process.env.BULKTEXT_SUPABASE_URL || discovered.API_URL || discovered.SUPABASE_URL, 'Local Supabase API URL')
const anonKey = required(process.env.BULKTEXT_SUPABASE_ANON_KEY || discovered.ANON_KEY || discovered.PUBLISHABLE_KEY, 'Local anon/publishable key')
const serviceRoleKey = required(process.env.BULKTEXT_SUPABASE_SERVICE_ROLE_KEY || discovered.SERVICE_ROLE_KEY || discovered.SECRET_KEY, 'Local service-role key')
const parsedUrl = new URL(url)
if (!['127.0.0.1', 'localhost'].includes(parsedUrl.hostname)) throw new Error(`Refusing to run phone-number fixtures against non-local Supabase URL: ${parsedUrl.origin}`)
if (parsedUrl.port && parsedUrl.port !== '56321') throw new Error(`Refusing to run against unexpected local API port ${parsedUrl.port}; BulkText should use 56321.`)

const admin = client(url, serviceRoleKey)
const anonymous = client(url, anonKey)
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const email = `bulktext-080-phone-${stamp}@example.test`
const password = `BulkText-${stamp}-Aa1!`
let userId = null

async function cleanup() {
  if (userId) {
    const result = await admin.auth.admin.deleteUser(userId)
    if (result.error) console.warn(`Cleanup warning: ${result.error.message}`)
  }
}

try {
  console.log('BulkText 0.13.0 local phone-number foundation acceptance')
  console.log(`Target: ${parsedUrl.origin}`)

  const schemaMeta = assertNoError(await admin.from('app_meta').select('value').eq('key', 'schema').single(), 'read schema metadata')
  assert(schemaMeta?.value?.version === '0.13.0', `Expected schema version 0.13.0, received ${JSON.stringify(schemaMeta?.value)}`)
  assert(schemaMeta?.value?.normalization_version === 'pk-mobile-v1', 'Normalization version metadata missing')
  console.log('✓ 0.13.0 migration metadata present')

  const anonymousAttempt = await anonymous.rpc('normalize_phone_number', { p_raw: '03001234567', p_default_country: 'PK' })
  assert(anonymousAttempt.error, 'Anonymous client unexpectedly executed normalize_phone_number')
  console.log('✓ Phone normalization RPC requires authentication')

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create phone-number test user')
  userId = created.data.user.id
  const signedIn = client(url, anonKey)
  const login = await signedIn.auth.signInWithPassword({ email, password })
  if (login.error) throw login.error

  const validCases = [
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['+923001234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['+92 300 123 4567', '+923001234567'],
    ['0300-123-4567', '+923001234567'],
  ]

  for (const [input, expected] of validCases) {
    const rows = assertNoError(await signedIn.rpc('normalize_phone_number', { p_raw: input, p_default_country: 'PK' }), `normalize ${input}`)
    const row = rows?.[0]
    assert(row?.validation_status === 'valid', `${input} was not marked valid`)
    assert(row?.normalized_e164 === expected, `${input} normalized to ${row?.normalized_e164}, expected ${expected}`)
    assert(row?.country_iso === 'PK' && row?.number_type === 'mobile', `${input} metadata is incomplete`)
  }
  console.log('✓ Supported Pakistan mobile formats converge to one E.164 value')

  const invalidCases = [
    ['', 'empty'],
    ['0300ABC4567', 'invalid_characters'],
    ['92+3001234567', 'invalid_characters'],
    ['0300123456', 'invalid_length'],
    ['02134567890', 'unsupported_number_type'],
    ['+14155552671', 'unsupported_country'],
  ]

  for (const [input, expectedStatus] of invalidCases) {
    const rows = assertNoError(await signedIn.rpc('normalize_phone_number', { p_raw: input, p_default_country: 'PK' }), `validate ${input || '<empty>'}`)
    const row = rows?.[0]
    assert(row?.validation_status === expectedStatus, `${input || '<empty>'} returned ${row?.validation_status}, expected ${expectedStatus}`)
    assert(row?.normalized_e164 === null, `${input || '<empty>'} unexpectedly returned canonical E.164`)
  }
  console.log('✓ Invalid, landline and foreign inputs fail with explicit statuses')

  const unsupportedDefault = assertNoError(await signedIn.rpc('normalize_phone_number', { p_raw: '03001234567', p_default_country: 'US' }), 'unsupported default country')
  assert(unsupportedDefault?.[0]?.validation_status === 'unsupported_country', 'Unsupported default country was not rejected')

  const canonicalGood = assertNoError(await admin.rpc('is_valid_pk_mobile_e164', { p_e164: '+923001234567' }), 'canonical predicate valid')
  const canonicalBad = assertNoError(await admin.rpc('is_valid_pk_mobile_e164', { p_e164: '03001234567' }), 'canonical predicate invalid')
  assert(canonicalGood === true && canonicalBad === false, 'Canonical predicate does not enforce +923xxxxxxxxx')
  console.log('✓ Server-side canonical predicate is strict and service-only')

  const browserPredicate = await signedIn.rpc('is_valid_pk_mobile_e164', { p_e164: '+923001234567' })
  assert(browserPredicate.error, 'Authenticated browser unexpectedly executed internal canonical predicate')
  console.log('✓ Internal constraint helper is not exposed to browser clients')

  console.log('\nBulkText 0.13.0 PHONE NUMBER FOUNDATION LOCAL PASS')
} finally {
  await cleanup()
}
