import { describe, expect, it } from 'vitest'
import { isCanonicalPakistanMobileE164, normalizePakistanMobile, normalizePhoneNumberLines } from '../lib/phoneNumbers'

describe('Pakistan phone number normalization', () => {
  const validCases = [
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['+923001234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['+92 300 123 4567', '+923001234567'],
    ['0300-123-4567', '+923001234567'],
    ['(0300) 123 4567', '+923001234567'],
  ] as const

  it.each(validCases)('normalizes %s to %s', (input, expected) => {
    const result = normalizePakistanMobile(input)
    expect(result.validationStatus).toBe('valid')
    expect(result.normalizedE164).toBe(expected)
    expect(result.countryIso).toBe('PK')
    expect(result.numberType).toBe('mobile')
  })

  it('rejects empty input', () => {
    expect(normalizePakistanMobile('   ').validationStatus).toBe('empty')
  })

  it('rejects alphabetic input', () => {
    expect(normalizePakistanMobile('0300ABC4567').validationStatus).toBe('invalid_characters')
  })

  it('rejects misplaced plus signs', () => {
    expect(normalizePakistanMobile('92+3001234567').validationStatus).toBe('invalid_characters')
  })

  it('rejects foreign numbers without pretending to normalize them', () => {
    const result = normalizePakistanMobile('+14155552671')
    expect(result.validationStatus).toBe('unsupported_country')
    expect(result.normalizedE164).toBeNull()
  })

  it('rejects Pakistan landline shapes for the mobile-only foundation', () => {
    const result = normalizePakistanMobile('02134567890')
    expect(result.validationStatus).toBe('unsupported_number_type')
  })

  it('rejects wrong mobile length', () => {
    expect(normalizePakistanMobile('0300123456').validationStatus).toBe('invalid_length')
  })

  it('recognizes canonical E.164 only', () => {
    expect(isCanonicalPakistanMobileE164('+923001234567')).toBe(true)
    expect(isCanonicalPakistanMobileE164('03001234567')).toBe(false)
  })

  it('normalizes newline-delimited input while dropping blank lines', () => {
    const rows = normalizePhoneNumberLines('03001234567\n\n+923111234567\n')
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.validationStatus === 'valid')).toBe(true)
  })
})
