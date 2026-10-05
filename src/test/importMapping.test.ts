import { describe, expect, it } from 'vitest'
import { autoDetectImportMapping, buildImportPreview, detectSmartImportMapping } from '../lib/importMapping'
import type { ParsedImportFile } from '../lib/importFiles'

const file: ParsedImportFile = {
  fileName: 'customers.csv',
  fileType: 'csv',
  fileSizeBytes: 123,
  fileSha256: 'a'.repeat(64),
  sheetName: null,
  headers: ['First Name', 'Last Name', 'Mobile Number', 'City'],
  sourceRowCount: 4,
  truncated: false,
  rows: [
    { sourceRowNumber: 2, values: { 'First Name': 'Ali', 'Last Name': 'Khan', 'Mobile Number': '03001234567', City: 'Karachi' } },
    { sourceRowNumber: 3, values: { 'First Name': 'Sara', 'Last Name': 'Ahmed', 'Mobile Number': '+92 300 123 4567', City: 'Hyderabad' } },
    { sourceRowNumber: 4, values: { 'First Name': 'No', 'Last Name': 'Phone', 'Mobile Number': '02134567890', City: 'Karachi' } },
    { sourceRowNumber: 5, values: { 'First Name': 'New', 'Last Name': 'User', 'Mobile Number': '03111234567', City: 'Lahore' } },
  ],
}

describe('import column mapping', () => {
  it('auto-detects common recipient fields', () => {
    expect(autoDetectImportMapping(file.headers)).toEqual({
      phone: 'Mobile Number',
      firstName: 'First Name',
      lastName: 'Last Name',
      displayName: null,
    })
  })

  it('builds normalized preview rows while preserving custom fields and duplicates', () => {
    const mapping = autoDetectImportMapping(file.headers)
    const preview = buildImportPreview(file, mapping)
    expect(preview.summary).toEqual({ totalRows: 4, validPhoneRows: 3, invalidPhoneRows: 1, duplicatePhoneRows: 1 })
    expect(preview.rows[0].displayName).toBe('Ali Khan')
    expect(preview.rows[0].normalization.normalizedE164).toBe('+923001234567')
    expect(preview.rows[1].duplicateInFile).toBe(true)
    expect(preview.rows[0].customFields).toEqual({ City: 'Karachi' })
    expect(preview.rows[2].normalization.validationStatus).toBe('unsupported_number_type')
  })


  it('detects real-world Contact columns and value-shaped phone columns', () => {
    const contactFile: ParsedImportFile = {
      ...file,
      headers: ['regno', 'name', 'Contact', 'email'],
      rows: [
        { sourceRowNumber: 2, values: { regno: 'A1', name: 'Ali', Contact: '923113722872', email: 'a@example.com' } },
        { sourceRowNumber: 3, values: { regno: 'A2', name: 'Sara', Contact: '923111023340', email: 's@example.com' } },
        { sourceRowNumber: 4, values: { regno: 'A3', name: 'Zafar', Contact: '923147711008', email: '' } },
      ],
      sourceRowCount: 3,
    }
    const detected = detectSmartImportMapping(contactFile)
    expect(detected.mapping.phone).toBe('Contact')
    expect(detected.mapping.displayName).toBe('name')
    expect(detected.confidence).toBe('high')

    const weirdHeader: ParsedImportFile = {
      ...contactFile,
      headers: ['Customer', 'Data 7'],
      rows: contactFile.rows.map((row) => ({
        sourceRowNumber: row.sourceRowNumber,
        values: { Customer: row.values.name, 'Data 7': row.values.Contact },
      })),
    }
    const contentDetected = detectSmartImportMapping(weirdHeader)
    expect(contentDetected.mapping.phone).toBe('Data 7')
    expect(contentDetected.phoneCandidates[0].validValues).toBe(3)
  })

  it('requires an explicit phone mapping before preview normalization', () => {
    const preview = buildImportPreview(file, { phone: '', firstName: null, lastName: null, displayName: null })
    expect(preview.rows).toEqual([])
    expect(preview.summary.invalidPhoneRows).toBe(4)
  })
})
