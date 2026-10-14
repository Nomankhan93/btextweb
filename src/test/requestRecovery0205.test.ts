import { afterEach, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { ApiFailure, classifyFailure, parseRetryAfter, recoveryFetch, recoveryRpc, retryDelay, withDeadline } from '../lib/requestRecovery'
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('classifies transport status without exposing SQL internals', () => {
  const failure = classifyFailure({ message: 'relation "secret" does not exist', code: '42P01' }, 'read', 503)
  expect(failure).toMatchObject({ kind: 'unavailable', retryable: true, status: 503, code: '42P01' })
  expect(failure.message).not.toContain('secret')
  expect(classifyFailure({ status: 429 }).kind).toBe('rate_limit')
  expect(classifyFailure({ status: 403 }).retryable).toBe(false)
  expect(classifyFailure({ code: 'refresh_token_not_found' }).kind).toBe('authentication')
  expect(classifyFailure({ code: '40001', message: 'Incomplete import' }).retryable).toBe(false)
})
it('bounds backoff and parses Retry-After seconds and HTTP dates', () => {
  expect([1,2,3,4,5,100].map(n => retryDelay(n, () => 1))).toEqual([5000,10000,20000,40000,60000,60000])
  expect(parseRetryAfter('120')).toBe(120000)
  expect(parseRetryAfter('Wed, 01 Jan 2025 00:01:00 GMT', Date.parse('2025-01-01T00:00:00Z'))).toBe(60000)
  expect(parseRetryAfter('invalid')).toBe(0)
})
it('aborts a hanging transport and releases its waiting caller', async () => {
  vi.useFakeTimers(); let signal!: AbortSignal
  const result = withDeadline('read', s => { signal=s; return new Promise(() => {}) })
  const assertion = expect(result).rejects.toMatchObject({ kind: 'timeout' })
  await vi.advanceTimersByTimeAsync(15000); await assertion
  expect(signal.aborted).toBe(true)
})
it('propagates parent cancellation without waiting for the deadline', async () => {
  const parent = new AbortController(); let signal!: AbortSignal
  const result = withDeadline('read', s => { signal=s; return new Promise(() => {}) }, parent.signal)
  await Promise.resolve(); parent.abort()
  await expect(result).rejects.toMatchObject({ kind: 'cancelled' }); expect(signal.aborted).toBe(true)
})
it('preserves HTTP status and Retry-After with the real Supabase request builder, without retries', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'busy', code: 'PGRST003' }), { status:429, headers:{ 'Content-Type':'application/json', 'Retry-After':'60' } }))
  vi.stubGlobal('fetch', fetchMock)
  const client = createClient('https://example.supabase.co', 'test-key', { auth:{persistSession:false,autoRefreshToken:false},global:{fetch:recoveryFetch} })
  await expect(recoveryRpc(client,'get_campaign_dispatch',{})).rejects.toMatchObject({ status:429,kind:'rate_limit',retryAfterMs:60000 })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('does not retry an ambiguous mutation through the fetch wrapper', async () => {
  const fetchMock = vi.fn(async () => new Response('unavailable', {status:503}))
  vi.stubGlobal('fetch',fetchMock)
  expect((await recoveryFetch('https://example.supabase.co/rest/v1/rpc/enqueue_campaign_dispatch',{method:'POST'})).status).toBe(503)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it('retains an already classified failure', () => {
  const failure=new ApiFailure('Slow','timeout','read')
  expect(classifyFailure(failure)).toBe(failure)
})

function streamedAuthFetch(body: string, status = 200, delay = 10) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const abort = () => { clearTimeout(timer); controller.error(new DOMException('signal is aborted without reason', 'AbortError')) }
        const timer = setTimeout(() => {
          init?.signal?.removeEventListener('abort', abort)
          controller.enqueue(new TextEncoder().encode(body)); controller.close()
        }, delay)
        init?.signal?.addEventListener('abort', abort, { once: true })
      },
    })
    return new Response(stream, { status, headers: { 'Content-Type': 'application/json' } })
  })
}
it('keeps delayed auth response bodies readable after headers arrive', async () => {
  vi.stubGlobal('fetch', streamedAuthFetch('{"user":{"id":"u"}}'))
  const response = await recoveryFetch('https://example.supabase.co/auth/v1/user')
  await expect(response.json()).resolves.toEqual({ user: { id: 'u' } })
})
it('retains a delayed auth rejection body and HTTP status', async () => {
  vi.stubGlobal('fetch', streamedAuthFetch('{"code":"invalid_credentials"}', 400))
  const response = await recoveryFetch('https://example.supabase.co/auth/v1/token?grant_type=password', { method: 'POST' })
  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toEqual({ code: 'invalid_credentials' })
})
it('bounds a stalled auth body, not just the response headers', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', streamedAuthFetch('{}', 200, 60000))
  const pending = recoveryFetch('https://example.supabase.co/auth/v1/user')
  const assertion = expect(pending).rejects.toMatchObject({ kind: 'timeout' })
  await vi.advanceTimersByTimeAsync(15000); await assertion
})
it('supports sign in, sign out, and sign in again through the real Supabase auth client', async () => {
  const token = JSON.stringify({ access_token:'token', refresh_token:'refresh', token_type:'bearer', expires_in:3600, user:{ id:'u', aud:'authenticated', role:'authenticated', email:'test@example.com' } })
  const streamed = streamedAuthFetch(token)
  const transport = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/logout')) return new Response(null, { status:204 })
    return streamed(input, init)
  })
  vi.stubGlobal('fetch',transport)
  const client = createClient('https://example.supabase.co','test-key', { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:recoveryFetch} })
  const credentials = {email:'test@example.com',password:'test-password'}
  const first = await client.auth.signInWithPassword(credentials)
  expect(first.error).toBeNull(); expect(first.data.session?.user.id).toBe('u')
  expect((await client.auth.signOut()).error).toBeNull()
  expect((await client.auth.getSession()).data.session).toBeNull()
  const second = await client.auth.signInWithPassword(credentials)
  expect(second.error).toBeNull(); expect(second.data.session?.user.id).toBe('u')
  expect(transport).toHaveBeenCalledTimes(3)
})
