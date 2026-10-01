import { describe, expect, it } from 'vitest'
import {
  analyzeMessageTemplate,
  discoverCustomFieldKeys,
  extractMessageTokens,
  renderPersonalizedMessage,
  summarizePersonalization,
  type PersonalizationSourceRow,
} from '../lib/messageComposer'

const ali: PersonalizationSourceRow = {
  eligibilityRowId: 1,
  previewRowId: 10,
  sourceRowNumber: 2,
  displayName: 'Ali Khan',
  firstName: 'Ali',
  lastName: 'Khan',
  normalizedE164: '+923001234567',
  customFields: { City: 'Karachi', 'Customer ID': 'C-100' },
}

const sara: PersonalizationSourceRow = {
  eligibilityRowId: 2,
  previewRowId: 11,
  sourceRowNumber: 3,
  displayName: 'Sara',
  firstName: 'Sara',
  lastName: null,
  normalizedE164: '+923111234567',
  customFields: { City: '', 'Customer ID': 'C-101' },
}

describe('message composer personalization', () => {
  it('extracts and normalizes supported tokens', () => {
    expect(extractMessageTokens('Hi {{ name }} {{custom: City}} {{phone}} {{name}}')).toEqual(['custom:City', 'name', 'phone'])
    expect(analyzeMessageTemplate('Hi {{name}}').malformed).toBe(false)
  })

  it('flags unsupported and malformed token syntax', () => {
    expect(analyzeMessageTemplate('Hi {{nickname}}').unsupportedTokens).toEqual(['nickname'])
    expect(analyzeMessageTemplate('Hi {{name').malformed).toBe(true)
  })

  it('renders built-in and custom personalization values', () => {
    const rendered = renderPersonalizedMessage('Hello {{name}} in {{custom:City}} — {{custom:Customer ID}}', ali)
    expect(rendered.text).toBe('Hello Ali Khan in Karachi — C-100')
    expect(rendered.complete).toBe(true)
  })

  it('makes missing personalization visible instead of silently erasing it', () => {
    const rendered = renderPersonalizedMessage('Hello {{first_name}} from {{custom:City}}', sara)
    expect(rendered.text).toContain('⟦missing:custom:City⟧')
    expect(rendered.missingTokens).toEqual(['custom:City'])
    expect(rendered.complete).toBe(false)
  })

  it('discovers custom fields and summarizes recipient completeness', () => {
    expect(discoverCustomFieldKeys([ali, sara])).toEqual(['City', 'Customer ID'])
    const summary = summarizePersonalization('Hi {{name}} {{custom:City}}', [ali, sara])
    expect(summary.recipientCount).toBe(2)
    expect(summary.completeRecipients).toBe(1)
    expect(summary.recipientsWithMissingValues).toBe(1)
    expect(summary.longestRenderedCharacters).toBeGreaterThan(0)
  })
})
