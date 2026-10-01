import { normalizePakistanMobile, type PhoneNumberNormalization } from './phoneNumbers'
import type { ParsedImportFile, ParsedImportRow } from './importFiles'

export interface ImportColumnMapping {
  phone: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
}

export interface ImportPreviewRow {
  sourceRowNumber: number
  rawData: Record<string, string>
  rawPhone: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  customFields: Record<string, string>
  normalization: PhoneNumberNormalization
  duplicateInFile: boolean
}

export interface ImportPreviewSummary {
  totalRows: number
  validPhoneRows: number
  invalidPhoneRows: number
  duplicatePhoneRows: number
}

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function findAlias(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((header) => ({ header, value: normalizedHeader(header) }))
  for (const alias of aliases) {
    const exact = normalized.find((candidate) => candidate.value === alias)
    if (exact) return exact.header
  }
  return null
}

export function autoDetectImportMapping(headers: string[]): ImportColumnMapping {
  return {
    phone: findAlias(headers, [
      'phone', 'phone number', 'mobile', 'mobile number', 'cell', 'cell phone', 'cellphone',
      'contact number', 'recipient', 'recipient phone', 'recipient number', 'msisdn', 'number',
    ]) ?? '',
    firstName: findAlias(headers, ['first name', 'firstname', 'given name', 'givenname']),
    lastName: findAlias(headers, ['last name', 'lastname', 'surname', 'family name', 'familyname']),
    displayName: findAlias(headers, ['full name', 'display name', 'customer name', 'contact name', 'name']),
  }
}

export function mappingUsesHeader(mapping: ImportColumnMapping, header: string): boolean {
  return [mapping.phone, mapping.firstName, mapping.lastName, mapping.displayName].some((value) => value === header)
}

function optionalValue(row: ParsedImportRow, header: string | null): string | null {
  if (!header) return null
  const value = (row.values[header] ?? '').trim()
  return value || null
}

function buildDisplayName(firstName: string | null, lastName: string | null, explicit: string | null): string | null {
  if (explicit) return explicit
  const combined = [firstName, lastName].filter(Boolean).join(' ').trim()
  return combined || null
}

export function buildImportPreview(file: ParsedImportFile, mapping: ImportColumnMapping): {
  rows: ImportPreviewRow[]
  summary: ImportPreviewSummary
} {
  if (!mapping.phone || !file.headers.includes(mapping.phone)) {
    return {
      rows: [],
      summary: { totalRows: file.rows.length, validPhoneRows: 0, invalidPhoneRows: file.rows.length, duplicatePhoneRows: 0 },
    }
  }

  const seen = new Set<string>()
  let validPhoneRows = 0
  let invalidPhoneRows = 0
  let duplicatePhoneRows = 0

  const rows = file.rows.map((row) => {
    const rawPhone = row.values[mapping.phone] ?? ''
    const normalization = normalizePakistanMobile(rawPhone)
    const firstName = optionalValue(row, mapping.firstName)
    const lastName = optionalValue(row, mapping.lastName)
    const explicitDisplayName = optionalValue(row, mapping.displayName)
    const displayName = buildDisplayName(firstName, lastName, explicitDisplayName)
    const customFields = Object.fromEntries(
      file.headers
        .filter((header) => !mappingUsesHeader(mapping, header))
        .map((header) => [header, row.values[header] ?? ''])
        .filter(([, value]) => value.trim() !== ''),
    )

    let duplicateInFile = false
    if (normalization.validationStatus === 'valid' && normalization.normalizedE164) {
      validPhoneRows += 1
      duplicateInFile = seen.has(normalization.normalizedE164)
      if (duplicateInFile) duplicatePhoneRows += 1
      else seen.add(normalization.normalizedE164)
    } else {
      invalidPhoneRows += 1
    }

    return {
      sourceRowNumber: row.sourceRowNumber,
      rawData: row.values,
      rawPhone,
      firstName,
      lastName,
      displayName,
      customFields,
      normalization,
      duplicateInFile,
    }
  })

  return {
    rows,
    summary: { totalRows: rows.length, validPhoneRows, invalidPhoneRows, duplicatePhoneRows },
  }
}
