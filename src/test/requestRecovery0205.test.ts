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
