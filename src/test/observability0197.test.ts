// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorMessage } from '../lib/errors'
import {
  clearRecentDiagnosticEvents,
  diagnosticSnapshot,
  getRecentDiagnosticEvents,
  reportDiagnostic,
} from '../lib/observability'

beforeEach(() => {
  sessionStorage.clear()
  clearRecentDiagnosticEvents()
  window.history.replaceState({}, '', '/campaigns/campaign-secret-id?token=secret-token')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('production-safe diagnostics', () => {
  it('records handled backend failures without storing raw message, details or hint text', () => {
    const visible = errorMessage({
      name: 'PostgrestError',
      message: 'permission denied for table organizations phone +923001234567',
      details: 'RLS rejected workspace 11111111-2222-3333-4444-555555555555',
      hint: 'token=super-secret-token',
      code: '42501',
      status: 403,
    }, 'Could not load organizations.')

    expect(visible).toBe('You do not have permission to perform this action.')
    const [event] = getRecentDiagnosticEvents()
    expect(event).toMatchObject({
      release: '0.20.5',
      source: 'handled-error',
      category: 'permission',
      code: '42501',
      status: '403',
      routeGroup: 'campaigns',
      online: true,
    })
    const stored = JSON.stringify(event)
    expect(stored).not.toContain('organizations')
    expect(stored).not.toContain('+923001234567')
    expect(stored).not.toContain('super-secret-token')
    expect(stored).not.toContain('11111111-2222')
    expect(stored).not.toContain('campaign-secret-id')
  })

  it('does not record expected user-safe domain validation messages as operational failures', () => {
    expect(errorMessage(new Error('No unique valid Pakistan mobile numbers were found in this file.'), 'Fallback')).toBe(
      'No unique valid Pakistan mobile numbers were found in this file.',
    )
    expect(getRecentDiagnosticEvents()).toHaveLength(0)
  })

  it('normalizes unsafe name/code/status tokens instead of persisting arbitrary backend text', () => {
    reportDiagnostic({
      name: 'Error user@example.com',
      message: 'server exploded with phone +923001234567',
      code: 'CODE secret-token-value',
      status: '500 injected',
    }, { source: 'window-error', severity: 'fatal' })

    const [event] = getRecentDiagnosticEvents()
    expect(event.name).toBeNull()
    expect(event.code).toBeNull()
    expect(event.status).toBeNull()
    expect(JSON.stringify(event)).not.toContain('user@example.com')
    expect(JSON.stringify(event)).not.toContain('+923001234567')
    expect(JSON.stringify(event)).not.toContain('secret-token-value')
  })

  it('keeps only the latest 25 sanitized events in session storage', () => {
    for (let index = 0; index < 30; index += 1) {
      reportDiagnostic(new Error(`failure ${index}`), { source: 'window-error' })
    }
    const events = getRecentDiagnosticEvents()
    expect(events).toHaveLength(25)
    expect(events.every((event) => event.release === '0.20.5')).toBe(true)
  })

  it('exports a support snapshot containing sanitized events only', () => {
    reportDiagnostic({ message: 'JWT expired bearer super-secret', code: 'PGRST301', status: 401 }, { source: 'unhandled-rejection', severity: 'fatal' })
    const snapshot = diagnosticSnapshot()
    expect(snapshot.release).toBe('0.20.5')
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.events[0].category).toBe('authentication')
    const exported = JSON.stringify(snapshot)
    expect(exported).not.toContain('bearer super-secret')
    expect(exported).not.toContain('JWT expired')
  })
})
