import type { ImportColumnMapping, ImportPreviewRow } from './importMapping'
import type { ParsedImportFile } from './importFiles'
import { errorMessage } from './errors'
import { supabase } from './supabase'

export interface ContactImportSummary {
  importId: string
  sourceFilename: string
  sourceType: 'csv' | 'xlsx'
  sourceSizeBytes: number
  sourceSha256: string
  sheetName: string | null
  totalRows: number
  validPhoneRows: number
  invalidPhoneRows: number
  duplicatePhoneRows: number
  status: 'staged'
  createdAt: string
  uploadedBy: string
}

interface ContactImportRow {
  import_id: string
  source_filename: string
  source_type: 'csv' | 'xlsx'
  source_size_bytes: number
  source_sha256: string
  sheet_name: string | null
  total_rows: number
  valid_phone_rows: number
  invalid_phone_rows: number
  duplicate_phone_rows: number
  status: 'staged'
  created_at: string
  uploaded_by: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function mapSummary(row: ContactImportRow): ContactImportSummary {
  return {
    importId: row.import_id,
    sourceFilename: row.source_filename,
    sourceType: row.source_type,
    sourceSizeBytes: row.source_size_bytes,
    sourceSha256: row.source_sha256,
    sheetName: row.sheet_name,
    totalRows: row.total_rows,
    validPhoneRows: row.valid_phone_rows,
    invalidPhoneRows: row.invalid_phone_rows,
    duplicatePhoneRows: row.duplicate_phone_rows,
    status: row.status,
    createdAt: row.created_at,
    uploadedBy: row.uploaded_by,
  }
}

export async function listContactImports(organizationId: string): Promise<ContactImportSummary[]> {
  const { data, error } = await client().rpc('list_contact_imports', { p_organization_id: organizationId })
  if (error) throw new Error(errorMessage(error, 'Could not load contact imports.'))
  return ((data ?? []) as ContactImportRow[]).map(mapSummary)
}

export const CONTACT_IMPORT_BATCH_ROWS = 250

export interface ContactImportProgress {
  phase: 'starting' | 'staging' | 'finalizing'
  completedRows: number
  totalRows: number
}

export interface CreateContactImportOptions {
  signal?: AbortSignal
  onProgress?: (progress: ContactImportProgress) => void
}

function importAbortError(): Error {
  const error = new Error('Import cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw importAbortError()
}

function rowPayload(row: ImportPreviewRow) {
  return {
    sourceRowNumber: row.sourceRowNumber,
    rawData: row.rawData,
    rawPhone: row.rawPhone,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    customFields: row.customFields,
  }
}

export async function createContactImport(
  organizationId: string,
  file: ParsedImportFile,
  mapping: ImportColumnMapping,
  rows: ImportPreviewRow[],
  options: CreateContactImportOptions = {},
): Promise<string> {
  if (rows.length < 1) throw new Error('Import must contain at least one recipient row.')
  throwIfAborted(options.signal)
  options.onProgress?.({ phase: 'starting', completedRows: 0, totalRows: rows.length })

  const { data, error } = await client().rpc('begin_contact_import', {
    p_organization_id: organizationId,
    p_source_filename: file.fileName,
    p_source_type: file.fileType,
    p_source_size_bytes: file.fileSizeBytes,
    p_source_sha256: file.fileSha256,
    p_sheet_name: file.sheetName,
    p_headers: file.headers,
    p_column_mapping: mapping,
  })
  if (error) throw new Error(errorMessage(error, 'Could not start the recipient import.'))
  if (typeof data !== 'string' || !data) throw new Error('Import staging returned an invalid identifier.')
  const importId = data

  try {
    for (let offset = 0; offset < rows.length; offset += CONTACT_IMPORT_BATCH_ROWS) {
      throwIfAborted(options.signal)
      const batch = rows.slice(offset, offset + CONTACT_IMPORT_BATCH_ROWS).map(rowPayload)
      const { error: appendError } = await client().rpc('append_contact_import_rows', {
        p_organization_id: organizationId,
        p_import_id: importId,
        p_rows: batch,
      })
      if (appendError) throw new Error(errorMessage(appendError, 'Could not stage recipient rows.'))
      throwIfAborted(options.signal)
      options.onProgress?.({
        phase: 'staging',
        completedRows: Math.min(offset + batch.length, rows.length),
        totalRows: rows.length,
      })
    }

    throwIfAborted(options.signal)
    options.onProgress?.({ phase: 'finalizing', completedRows: rows.length, totalRows: rows.length })
    const { error: finalizeError } = await client().rpc('finalize_contact_import', {
      p_organization_id: organizationId,
      p_import_id: importId,
      p_expected_total_rows: rows.length,
    })
    if (finalizeError) throw new Error(errorMessage(finalizeError, 'Could not finalize the recipient import.'))
    return importId
  } catch (reason) {
    // Incomplete staging sessions are never exposed as usable imports. Best-effort
    // cleanup avoids leaving large abandoned batches if the user cancels or a request fails.
    try {
      await client().rpc('abort_contact_import', {
        p_organization_id: organizationId,
        p_import_id: importId,
      })
    } catch {
      // The original staging error remains authoritative.
    }
    throw reason
  }
}

export async function deleteContactImport(organizationId: string, importId: string): Promise<void> {
  const { error } = await client().rpc('delete_contact_import', {
    p_organization_id: organizationId,
    p_import_id: importId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not delete the staged import.'))
}
