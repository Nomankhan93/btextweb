import { getRuntimeConfig } from './env'

export const OBSERVABILITY_RELEASE = '0.20.3'
const STORAGE_KEY = 'bulktext:diagnostics:v1'
const MAX_EVENTS = 25

export type DiagnosticCategory = 'network' | 'authentication' | 'permission' | 'internal' | 'unknown'
export type DiagnosticSource = 'handled-error' | 'window-error' | 'unhandled-rejection' | 'react-render' | 'route-load'
export type DiagnosticSeverity = 'warning' | 'error' | 'fatal'

interface DiagnosticContextLike {
  name?: unknown
  message?: unknown
  details?: unknown
  hint?: unknown
  code?: unknown
  status?: unknown
  statusCode?: unknown
}

export interface ClientDiagnosticEvent {
  id: string
  occurredAt: string
  release: string
  environment: string
  source: DiagnosticSource
  category: DiagnosticCategory
  severity: DiagnosticSeverity
  name: string | null
  code: string | null
  status: string | null
  routeGroup: string
  online: boolean | null
  fingerprint: string
}

export interface DiagnosticSnapshot {
  release: string
  environment: string
  generatedAt: string
  events: ClientDiagnosticEvent[]
}

type DiagnosticListener = (events: readonly ClientDiagnosticEvent[]) => void
const listeners = new Set<DiagnosticListener>()
let installed = false
let sequence = 0

const NETWORK_MARKERS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'network request failed',
  'load failed',
  'fetch failed',
  'connection refused',
  'connection reset',
  'connection timed out',
  'could not reach bulktext',
]
const AUTH_MARKERS = ['authentication required', 'auth session missing', 'session expired', 'jwt expired', 'invalid jwt', 'token expired', 'not authenticated']
const PERMISSION_MARKERS = ['permission denied', 'insufficient permission', 'membership required', 'owner permission required', 'access required', 'row-level security', 'rls rejected']
const INTERNAL_MARKERS = [
  'supabase is not configured',
  'postgrest',
  'pgrst',
  'sqlstate',
  'stack trace',
  'schema cache',
  'syntax error at or near',
  'relation "',
  'column "',
  'function public.',
  'table public.',
  'permission denied for table',
  'violates row-level security',
  'violates foreign key constraint',
  'violates unique constraint',
  'null value in column',
]

function cleanText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function safeToken(value: unknown, maxLength: number): string | null {
  const text = cleanText(value)
  if (!text || text.length > maxLength || !/^[A-Za-z0-9_.-]+$/.test(text)) return null
  return text
}

function diagnosticContext(reason: unknown): DiagnosticContextLike {
  if (reason instanceof Error) return reason as Error & DiagnosticContextLike
  if (reason && typeof reason === 'object') return reason as DiagnosticContextLike
  return { message: cleanText(reason) }
}

function includesAny(text: string, markers: readonly string[]): boolean {
  const lowered = text.toLowerCase()
  return markers.some((marker) => lowered.includes(marker))
}

function classify(reason: unknown): DiagnosticCategory {
  const context = diagnosticContext(reason)
  const status = cleanText(context.status ?? context.statusCode)
  const code = cleanText(context.code)
  const combined = [context.message, context.details, context.hint, code, status]
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .join(' ')

  if (includesAny(combined, NETWORK_MARKERS)) return 'network'
  if (status === '401' || includesAny(combined, AUTH_MARKERS)) return 'authentication'
  if (status === '403' || code === '42501' || includesAny(combined, PERMISSION_MARKERS)) return 'permission'
  const statusNumber = Number(status)
  if ((Number.isFinite(statusNumber) && statusNumber >= 500) || includesAny(combined, INTERNAL_MARKERS)) return 'internal'
  return 'unknown'
}

function currentRouteGroup(): string {
  if (typeof window === 'undefined') return 'server'
  const first = window.location.pathname.split('/').filter(Boolean)[0]
  if (!first) return 'public'
  if (first === 'auth') return 'auth'
  const known = new Set(['dashboard', 'campaigns', 'composer', 'contacts', 'imports', 'recipient-previews', 'consent-suppression', 'devices', 'templates', 'reports', 'subscription', 'settings'])
  return known.has(first) ? first : 'other'
}

function currentOnline(): boolean | null {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return null
  return navigator.onLine
}

function readEvents(): ClientDiagnosticEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ClientDiagnosticEvent => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.source === 'string')).slice(-MAX_EVENTS)
  } catch {
    return []
  }
}

function writeEvents(events: readonly ClientDiagnosticEvent[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)))
  } catch {
    // Diagnostics must never break the application if storage is unavailable.
  }
}

function nextId() {
  sequence = (sequence + 1) % 1_000_000
  return `diag-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function notify(events: readonly ClientDiagnosticEvent[]) {
  for (const listener of listeners) {
    try {
      listener(events)
    } catch {
      // Observability subscribers must never break the application.
    }
  }
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('bulktext:diagnostic', { detail: events.at(-1) }))
    } catch {
      // Browser event delivery is best-effort only.
    }
  }
}

export function reportDiagnostic(
  reason: unknown,
  options: { source: DiagnosticSource; category?: DiagnosticCategory; severity?: DiagnosticSeverity },
): ClientDiagnosticEvent {
  const context = diagnosticContext(reason)
  const category = options.category ?? classify(reason)
  const name = safeToken(context.name ?? (reason instanceof Error ? reason.name : null), 64)
  const code = safeToken(context.code, 32)
  const status = safeToken(context.status ?? context.statusCode, 16)
  const routeGroup = currentRouteGroup()
  const fingerprint = [options.source, category, name ?? '-', code ?? '-', status ?? '-', routeGroup].join(':')
  const runtime = getRuntimeConfig()
  const event: ClientDiagnosticEvent = {
    id: nextId(),
    occurredAt: new Date().toISOString(),
    release: OBSERVABILITY_RELEASE,
    environment: runtime.appEnvironment,
    source: options.source,
    category,
    severity: options.severity ?? 'error',
    name,
    code,
    status,
    routeGroup,
    online: currentOnline(),
    fingerprint,
  }
  const events = [...readEvents(), event].slice(-MAX_EVENTS)
  writeEvents(events)
  notify(events)
  return event
}

export function getRecentDiagnosticEvents(): ClientDiagnosticEvent[] {
  return readEvents()
}

export function clearRecentDiagnosticEvents() {
  writeEvents([])
  notify([])
}

export function diagnosticSnapshot(): DiagnosticSnapshot {
  const runtime = getRuntimeConfig()
  return {
    release: OBSERVABILITY_RELEASE,
    environment: runtime.appEnvironment,
    generatedAt: new Date().toISOString(),
    events: readEvents(),
  }
}

export function subscribeDiagnosticEvents(listener: DiagnosticListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function installGlobalObservability() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    reportDiagnostic(event.error ?? event.message, { source: 'window-error', severity: 'fatal' })
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic(event.reason, { source: 'unhandled-rejection', severity: 'fatal' })
  })
}
