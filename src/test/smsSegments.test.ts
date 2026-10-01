import { describe, expect, it } from 'vitest'
import { type PersonalizationSourceRow } from '../lib/messageComposer'
import {
  SMS_LONG_MESSAGE_WARNING_SEGMENTS,
  estimatePersonalizedSmsUsage,
  estimateSmsMessage,
  gsm7SeptetLength,
  isGsm7Text,
} from '../lib/smsSegments'

function row(id: number, overrides: Partial<PersonalizationSourceRow> = {}): PersonalizationSourceRow {
  return {
    eligibilityRowId: id,
    previewRowId: id + 100,
    sourceRowNumber: id + 1,
    displayName: `Recipient ${id}`,
    firstName: `Recipient${id}`,
    lastName: null,
    normalizedE164: `+92300${String(1000000 + id).slice(-7)}`,
    customFields: {},
    ...overrides,
  }
}

describe('SMS segment estimation', () => {
  it('uses GSM-7 single and multipart boundaries', () => {
    expect(estimateSmsMessage('A'.repeat(160))).toMatchObject({ encoding: 'GSM-7', encodingUnits: 160, segments: 1 })
    expect(estimateSmsMessage('A'.repeat(161))).toMatchObject({ encoding: 'GSM-7', encodingUnits: 161, segments: 2 })
    expect(estimateSmsMessage('A'.repeat(306))).toMatchObject({ segments: 2 })
    expect(estimateSmsMessage('A'.repeat(307))).toMatchObject({ segments: 3 })
  })

  it('counts GSM-7 extension characters as two septets', () => {
    expect(isGsm7Text('Price €10 ^ test')).toBe(true)
    expect(gsm7SeptetLength('^')).toBe(2)
    expect(estimateSmsMessage(`${'A'.repeat(158)}^`)).toMatchObject({ encodingUnits: 160, segments: 1 })
    expect(estimateSmsMessage(`${'A'.repeat(159)}^`)).toMatchObject({ encodingUnits: 161, segments: 2 })
  })

  it('uses Unicode limits for Urdu and mixed text', () => {
    expect(estimateSmsMessage('ا'.repeat(70))).toMatchObject({ encoding: 'Unicode', encodingUnits: 70, segments: 1 })
    expect(estimateSmsMessage('ا'.repeat(71))).toMatchObject({ encoding: 'Unicode', encodingUnits: 71, segments: 2 })
    expect(estimateSmsMessage('Hello علی')).toMatchObject({ encoding: 'Unicode' })
  })

  it('counts supplementary Unicode characters conservatively as two UTF-16 units', () => {
    expect(estimateSmsMessage('🙂'.repeat(35))).toMatchObject({ encoding: 'Unicode', characters: 35, encodingUnits: 70, segments: 1 })
    expect(estimateSmsMessage('🙂'.repeat(36))).toMatchObject({ encodingUnits: 72, segments: 2 })
  })

  it('calculates personalized recipient totals independently', () => {
    const rows = [
      row(1, { displayName: 'Ali' }),
      row(2, { displayName: 'علی' }),
    ]
    const summary = estimatePersonalizedSmsUsage('Hello {{name}}', rows)
    expect(summary.readyRecipients).toBe(2)
    expect(summary.blockedRecipients).toBe(0)
    expect(summary.encodingSummary).toBe('Mixed')
    expect(summary.gsm7Recipients).toBe(1)
    expect(summary.unicodeRecipients).toBe(1)
    expect(summary.estimatedSmsUnits).toBe(2)
    expect(summary.averageSegments).toBe(1)
  })

  it('excludes incomplete personalization from estimated package usage', () => {
    const rows = [
      row(1, { customFields: { City: 'Karachi' } }),
      row(2, { customFields: { City: '' } }),
    ]
    const summary = estimatePersonalizedSmsUsage('Hi {{name}} from {{custom:City}}', rows)
    expect(summary.recipientCount).toBe(2)
    expect(summary.readyRecipients).toBe(1)
    expect(summary.blockedRecipients).toBe(1)
    expect(summary.estimatedSmsUnits).toBe(1)
    expect(summary.recipients[1]?.estimate).toBeNull()
  })

  it('flags unusually long personalized messages by product threshold', () => {
    const summary = estimatePersonalizedSmsUsage('A'.repeat(460), [row(1)])
    expect(summary.maximumSegments).toBeGreaterThanOrEqual(SMS_LONG_MESSAGE_WARNING_SEGMENTS)
    expect(summary.longMessageRecipients).toBe(1)
  })
})
