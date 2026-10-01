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

export async function createContactImport(
  organizationId: string,
  file: ParsedImportFile,
  mapping: ImportColumnMapping,
  rows: ImportPreviewRow[],
): Promise<string> {
  const payload = rows.map((row) => ({
    sourceRowNumber: row.sourceRowNumber,
    rawData: row.rawData,
    rawPhone: row.rawPhone,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    customFields: row.customFields,
  }))

  const { data, error } = await client().rpc('create_contact_import', {
    p_organization_id: organizationId,
    p_source_filename: file.fileName,
    p_source_type: file.fileType,
    p_source_size_bytes: file.fileSizeBytes,
    p_source_sha256: file.fileSha256,
    p_sheet_name: file.sheetName,
    p_headers: file.headers,
    p_column_mapping: mapping,
    p_rows: payload,
  })
  if (error) throw new Error(errorMessage(error, 'Could not stage the import.'))
  if (typeof data !== 'string' || !data) throw new Error('Import staging returned an invalid identifier.')
  return data
}

export async function deleteContactImport(organizationId: string, importId: string): Promise<void> {
  const { error } = await client().rpc('delete_contact_import', {
    p_organization_id: organizationId,
    p_import_id: importId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not delete the staged import.'))
}
