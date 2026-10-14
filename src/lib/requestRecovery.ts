import type { SupabaseClient } from '@supabase/supabase-js'
import { errorDiagnosticCategory, errorDiagnosticContext, errorMessage } from './errors'

export const READ_TIMEOUT_MS = 15_000
export type FailureKind = 'network' | 'timeout' | 'rate_limit' | 'unavailable' | 'authentication' | 'permission' | 'domain' | 'cancelled'
export class ApiFailure extends Error {
  constructor(message: string, readonly kind: FailureKind, readonly operation: string,
    readonly status: number | null = null, readonly code: string | null = null,
    readonly retryAfterMs = 0) { super(message); this.name = 'ApiFailure' }
  get retryable() { return ['network', 'timeout', 'rate_limit', 'unavailable'].includes(this.kind) }
}
export function classifyFailure(reason: unknown, operation = 'status', status?: number): ApiFailure {
  if (reason instanceof ApiFailure) return reason
  const context = errorDiagnosticContext(reason)
  const http = status || Number(context.status) || null
  const category = errorDiagnosticCategory({ ...context, status: http ? String(http) : context.status })
  const kind: FailureKind = context.name === 'AbortError' ? 'cancelled'
    : http === 429 ? 'rate_limit' : http !== null && http >= 500 ? 'unavailable'
    : category === 'authentication' ? 'authentication' : category === 'permission' ? 'permission'
    : category === 'network' || reason instanceof TypeError ? 'network' : 'domain'
  return new ApiFailure(errorMessage(reason, 'Could not refresh BulkText. Please try again.'), kind, operation, http, context.code)
}
export function retryDelay(failures: number, random = Math.random): number {
  return Math.round(Math.min(60_000, 5000 * 2 ** Math.min(Math.max(failures - 1, 0), 4)) * (0.8 + random() * 0.2))
}
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 0
  const seconds = Number(value)
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 86_400_000)) : 0
}
const retryHeaders = new WeakMap<AbortSignal, number>()
/** Metadata only. Never retries fetch, especially not mutations. */
export const recoveryFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const authRead = /\/auth\/v1\/(user|token)(?:\?|$)/.test(url)
  const response = authRead
    ? await withDeadline('auth-transport', signal => fetch(input, { ...init, signal }), init?.signal ?? undefined)
    : await fetch(input, init)
  if (init?.signal) retryHeaders.set(init.signal, parseRetryAfter(response.headers.get('Retry-After')))
  return response
}
/** Cancels the underlying operation AND bounds waiting if a transport ignores abort. */
export async function withDeadline<T>(operation: string, run: (signal: AbortSignal) => PromiseLike<T>, parent?: AbortSignal, ms = READ_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectAbort!: (reason: unknown) => void
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject })
  const abort = () => {
    controller.abort()
    rejectAbort(new ApiFailure('Request cancelled.', 'cancelled', operation))
  }
  if (parent?.aborted) throw new ApiFailure('Request cancelled.', 'cancelled', operation)
  parent?.addEventListener('abort', abort, { once: true })
  timer = setTimeout(() => {
    controller.abort()
    rejectAbort(new ApiFailure('BulkText cloud is responding slowly. Last loaded details are shown.', 'timeout', operation))
  }, ms)
  try { return await Promise.race([Promise.resolve(run(controller.signal)), cancelled]) }
  finally { controller.abort(); clearTimeout(timer); parent?.removeEventListener('abort', abort) }
}

// Explicitly reviewed operations. Workspace provisioning is bounded but is NOT auto-retried here.
export const RECOVERY_OPERATIONS = {
  get_campaign_dispatch: 'read', get_campaign_delivery_status: 'read',
  list_campaign_message_attempts: 'read', get_campaign_contract_health: 'read',
  list_gateway_device_dashboard: 'read', list_gateway_pairing_sessions: 'read',
  get_my_personal_workspace: 'bootstrap',
} as const
export async function recoveryRpc(client: SupabaseClient, operation: keyof typeof RECOVERY_OPERATIONS,
  args: Record<string, unknown> = {}, signal?: AbortSignal) {
  return withDeadline(operation, async requestSignal => {
    const request = client.rpc(operation, args).abortSignal(requestSignal)
    const response = await request
    if (response.error) {
      const failure = classifyFailure(response.error, operation, response.status)
      throw new ApiFailure(failure.message, failure.kind, operation, failure.status, failure.code, retryHeaders.get(requestSignal) ?? 0)
    }
    return response
  }, signal).catch(reason => { throw classifyFailure(reason, operation) })
}
