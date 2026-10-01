import { describe, expect, it } from 'vitest'
import { errorMessage } from '../lib/errors'

describe('errorMessage', () => {
  it('keeps normal Error messages', () => {
    expect(errorMessage(new Error('Authentication required'), 'Fallback')).toBe('Authentication required')
  })

  it('surfaces PostgREST-style plain object details', () => {
    expect(errorMessage({
      message: 'permission denied for table organizations',
      details: 'RLS rejected the request',
      hint: 'Check membership',
      code: '42501',
    }, 'Fallback')).toBe('permission denied for table organizations — RLS rejected the request — Hint: Check membership [42501]')
  })

  it('uses the fallback for unknown values', () => {
    expect(errorMessage({ unexpected: true }, 'Workspace could not be created.')).toBe('Workspace could not be created.')
  })
})
