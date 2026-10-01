export interface RecipientValidationRow {
  importRowId: number
  sourceRowNumber: number
  rawPhone: string
  normalizedE164: string | null
  phoneValidationStatus: string
  phoneValidationReason: string
  firstName: string | null
  lastName: string | null
  displayName: string | null
  customFields: Record<string, unknown>
  duplicateGroupSize: number
}

export type RecipientDecision = 'included' | 'invalid_phone' | 'duplicate_in_file' | 'manually_excluded'

export interface RecipientDecisionRow extends RecipientValidationRow {
  decision: RecipientDecision
}

export interface RecipientDecisionSummary {
  totalRows: number
  includedRows: number
  invalidPhoneRows: number
  duplicateRows: number
  manuallyExcludedRows: number
}

function isValidRow(row: RecipientValidationRow): boolean {
  return row.phoneValidationStatus === 'valid' && Boolean(row.normalizedE164)
}

export function defaultRecipientSelection(rows: RecipientValidationRow[]): Set<number> {
  const selected = new Set<number>()
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isValidRow(row) || !row.normalizedE164 || seen.has(row.normalizedE164)) continue
    seen.add(row.normalizedE164)
    selected.add(row.importRowId)
  }
  return selected
}

export function toggleRecipientSelection(
  rows: RecipientValidationRow[],
  selected: ReadonlySet<number>,
  rowId: number,
): Set<number> {
  const next = new Set(selected)
  const row = rows.find((candidate) => candidate.importRowId === rowId)
  if (!row || !isValidRow(row) || !row.normalizedE164) return next

  if (next.has(rowId)) {
    next.delete(rowId)
    return next
  }

  for (const candidate of rows) {
    if (candidate.normalizedE164 === row.normalizedE164) next.delete(candidate.importRowId)
  }
  next.add(rowId)
  return next
}

export function classifyRecipientRows(
  rows: RecipientValidationRow[],
  selected: ReadonlySet<number>,
): RecipientDecisionRow[] {
  const selectedNumbers = new Set(
    rows
      .filter((row) => selected.has(row.importRowId) && isValidRow(row) && row.normalizedE164)
      .map((row) => row.normalizedE164 as string),
  )

  return rows.map((row) => {
    let decision: RecipientDecision
    if (!isValidRow(row) || !row.normalizedE164) decision = 'invalid_phone'
    else if (selected.has(row.importRowId)) decision = 'included'
    else if (selectedNumbers.has(row.normalizedE164)) decision = 'duplicate_in_file'
    else decision = 'manually_excluded'
    return { ...row, decision }
  })
}

export function summarizeRecipientDecisions(rows: RecipientDecisionRow[]): RecipientDecisionSummary {
  return {
    totalRows: rows.length,
    includedRows: rows.filter((row) => row.decision === 'included').length,
    invalidPhoneRows: rows.filter((row) => row.decision === 'invalid_phone').length,
    duplicateRows: rows.filter((row) => row.decision === 'duplicate_in_file').length,
    manuallyExcludedRows: rows.filter((row) => row.decision === 'manually_excluded').length,
  }
}
