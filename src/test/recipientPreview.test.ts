import { describe, expect, it } from 'vitest'
import {
  classifyRecipientRows,
  defaultRecipientSelection,
  summarizeRecipientDecisions,
  toggleRecipientSelection,
  type RecipientValidationRow,
} from '../lib/recipientPreview'

const rows: RecipientValidationRow[] = [
  { importRowId: 1, sourceRowNumber: 2, rawPhone: '03001234567', normalizedE164: '+923001234567', phoneValidationStatus: 'valid', phoneValidationReason: 'ok', firstName: 'Ali', lastName: null, displayName: 'Ali', customFields: {}, duplicateGroupSize: 2 },
  { importRowId: 2, sourceRowNumber: 3, rawPhone: '+923001234567', normalizedE164: '+923001234567', phoneValidationStatus: 'valid', phoneValidationReason: 'ok', firstName: 'Sara', lastName: null, displayName: 'Sara', customFields: {}, duplicateGroupSize: 2 },
  { importRowId: 3, sourceRowNumber: 4, rawPhone: '02134567890', normalizedE164: null, phoneValidationStatus: 'unsupported_number_type', phoneValidationReason: 'mobile only', firstName: null, lastName: null, displayName: 'Landline', customFields: {}, duplicateGroupSize: 0 },
  { importRowId: 4, sourceRowNumber: 5, rawPhone: '03111234567', normalizedE164: '+923111234567', phoneValidationStatus: 'valid', phoneValidationReason: 'ok', firstName: null, lastName: null, displayName: 'Ayesha', customFields: {}, duplicateGroupSize: 1 },
]

describe('recipient preview decisions', () => {
  it('selects the first valid row for each canonical number by default', () => {
    expect([...defaultRecipientSelection(rows)]).toEqual([1, 4])
  })

  it('switches duplicate selection to another source row without selecting both', () => {
    const selected = toggleRecipientSelection(rows, defaultRecipientSelection(rows), 2)
    expect([...selected].sort()).toEqual([2, 4])
  })

  it('classifies invalid, duplicate and manually excluded rows explicitly', () => {
    const selected = new Set([2])
    const decisions = classifyRecipientRows(rows, selected)
    expect(decisions.map((row) => row.decision)).toEqual([
      'duplicate_in_file',
      'included',
      'invalid_phone',
      'manually_excluded',
    ])
    expect(summarizeRecipientDecisions(decisions)).toEqual({
      totalRows: 4,
      includedRows: 1,
      invalidPhoneRows: 1,
      duplicateRows: 1,
      manuallyExcludedRows: 1,
    })
  })

  it('never selects an invalid row', () => {
    const selected = toggleRecipientSelection(rows, new Set<number>(), 3)
    expect(selected.size).toBe(0)
  })
})
