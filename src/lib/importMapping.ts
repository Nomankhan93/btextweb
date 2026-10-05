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

export interface PhoneColumnCandidate {
  header: string
  sampledValues: number
  validValues: number
  validRatio: number
  score: number
  headerMatched: boolean
}

export interface SmartImportDetection {
  mapping: ImportColumnMapping
  phoneCandidates: PhoneColumnCandidate[]
  confidence: 'high' | 'medium' | 'low'
  message: string
}

const phoneAliases = [
  'phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'mobile number',
  'cell', 'cell no', 'cell number', 'cell phone', 'cellphone',
  'contact', 'contact no', 'contact number', 'contact phone', 'contact mobile',
  'whatsapp', 'whatsapp no', 'whatsapp number', 'telephone', 'tel',
  'recipient', 'recipient phone', 'recipient number', 'recipient mobile', 'msisdn', 'number',
]

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

function phoneHeaderScore(header: string): number {
  const value = normalizedHeader(header)
  if (phoneAliases.includes(value)) return 120
  if (/\b(phone|mobile|cell|contact|whatsapp|msisdn|telephone|tel)\b/.test(value)) return 75
  return 0
}

function nameMapping(headers: string[]): Omit<ImportColumnMapping, 'phone'> {
  return {
    firstName: findAlias(headers, ['first name', 'firstname', 'given name', 'givenname']),
    lastName: findAlias(headers, ['last name', 'lastname', 'surname', 'family name', 'familyname']),
    displayName: findAlias(headers, ['full name', 'display name', 'customer name', 'contact name', 'client name', 'name']),
  }
}

export function autoDetectImportMapping(headers: string[]): ImportColumnMapping {
  return {
    phone: findAlias(headers, phoneAliases) ?? '',
    ...nameMapping(headers),
  }
}

export function detectSmartImportMapping(file: ParsedImportFile): SmartImportDetection {
  const sampleRows = file.rows.slice(0, 250)
  const candidates = file.headers.map((header): PhoneColumnCandidate => {
    const values = sampleRows
      .map((row) => (row.values[header] ?? '').trim())
      .filter(Boolean)
    const validValues = values.filter((value) => normalizePakistanMobile(value).validationStatus === 'valid').length
    const validRatio = values.length ? validValues / values.length : 0
    const headerScore = phoneHeaderScore(header)
    // Header semantics are useful, but actual phone-shaped values are authoritative.
    const contentScore = validValues === 0 ? 0 : Math.round(validRatio * 100) + Math.min(validValues, 25) * 2
    return {
      header,
      sampledValues: values.length,
      validValues,
      validRatio,
      score: headerScore + contentScore,
      headerMatched: headerScore > 0,
    }
  }).sort((a, b) => b.score - a.score || b.validRatio - a.validRatio || b.validValues - a.validValues || a.header.localeCompare(b.header))

  const best = candidates[0]
  const second = candidates[1]
  const contentStrong = Boolean(best && best.validValues >= Math.min(3, Math.max(1, sampleRows.length)) && best.validRatio >= 0.6)
  const clearlyAhead = !second || best.score >= second.score + 30 || best.validRatio >= second.validRatio + 0.35
  const phone = best && (best.headerMatched || contentStrong) ? best.header : ''
  const base = nameMapping(file.headers)
  const confidence: SmartImportDetection['confidence'] = phone && contentStrong && clearlyAhead
    ? 'high'
    : phone && (best?.headerMatched || (best?.validRatio ?? 0) >= 0.4)
      ? 'medium'
      : 'low'

  let message = 'Choose the column that contains mobile numbers.'
  if (phone && best) {
    const percent = Math.round(best.validRatio * 100)
    message = `Detected “${phone}” as the phone column (${best.validValues}/${best.sampledValues || 0} sampled non-empty values look like Pakistan mobile numbers${best.sampledValues ? `, ${percent}%` : ''}).`
  }

  return {
    mapping: { phone, ...base },
    phoneCandidates: candidates.filter((candidate) => candidate.headerMatched || candidate.validValues > 0).slice(0, 5),
    confidence,
    message,
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
