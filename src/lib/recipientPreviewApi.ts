import { errorMessage } from './errors'
import type { RecipientValidationRow } from './recipientPreview'
import { supabase } from './supabase'

export interface RecipientPreviewSummary {
  previewId: string
  importId: string
  sourceFilename: string
  revision: number
  validationVersion: string
  totalRows: number
  includedRows: number
  invalidPhoneRows: number
  duplicateRows: number
  manuallyExcludedRows: number
  createdAt: string
  createdBy: string
}

export interface StoredRecipientPreviewRow {
  previewRowId: number
  importRowId: number
  sourceRowNumber: number
  displayName: string | null
  rawPhone: string
  normalizedE164: string | null
  phoneValidationStatus: string
  phoneValidationReason: string
  duplicateGroupSize: number
  decision: 'included' | 'excluded'
  exclusionReason: 'invalid_phone' | 'duplicate_in_file' | 'manually_excluded' | null
  customFields: Record<string, unknown>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listImportValidationRows(
  organizationId: string,
  importId: string,
): Promise<RecipientValidationRow[]> {
  const { data, error } = await client().rpc('list_contact_import_validation_rows', {
    p_organization_id: organizationId,
    p_import_id: importId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load staged recipient rows.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    importRowId: Number(row.import_row_id),
    sourceRowNumber: Number(row.source_row_number),
    rawPhone: String(row.raw_phone ?? ''),
    normalizedE164: row.normalized_e164 ? String(row.normalized_e164) : null,
    phoneValidationStatus: String(row.phone_validation_status ?? ''),
    phoneValidationReason: String(row.phone_validation_reason ?? ''),
    firstName: row.first_name ? String(row.first_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
    duplicateGroupSize: Number(row.duplicate_group_size ?? 0),
  }))
}

export async function createRecipientPreview(
  organizationId: string,
  importId: string,
  selectedRowIds: number[],
): Promise<string> {
  const { data, error } = await client().rpc('create_recipient_preview', {
    p_organization_id: organizationId,
    p_import_id: importId,
    p_selected_row_ids: selectedRowIds,
  })
  if (error) throw new Error(errorMessage(error, 'Could not create recipient preview.'))
  if (typeof data !== 'string' || !data) throw new Error('Recipient preview returned an invalid identifier.')
  return data
}

export async function listRecipientPreviews(
  organizationId: string,
  importId: string,
): Promise<RecipientPreviewSummary[]> {
  const { data, error } = await client().rpc('list_recipient_previews', {
    p_organization_id: organizationId,
    p_import_id: importId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load recipient preview history.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    previewId: String(row.preview_id),
    importId: String(row.import_id),
    sourceFilename: String(row.source_filename ?? ''),
    revision: Number(row.revision),
    validationVersion: String(row.validation_version ?? ''),
    totalRows: Number(row.total_rows),
    includedRows: Number(row.included_rows),
    invalidPhoneRows: Number(row.invalid_phone_rows),
    duplicateRows: Number(row.duplicate_rows),
    manuallyExcludedRows: Number(row.manually_excluded_rows),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
  }))
}

export async function getRecipientPreviewRows(
  organizationId: string,
  previewId: string,
): Promise<StoredRecipientPreviewRow[]> {
  const { data, error } = await client().rpc('get_recipient_preview_rows', {
    p_organization_id: organizationId,
    p_preview_id: previewId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load recipient preview rows.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    previewRowId: Number(row.preview_row_id),
    importRowId: Number(row.import_row_id),
    sourceRowNumber: Number(row.source_row_number),
    displayName: row.display_name ? String(row.display_name) : null,
    rawPhone: String(row.raw_phone ?? ''),
    normalizedE164: row.normalized_e164 ? String(row.normalized_e164) : null,
    phoneValidationStatus: String(row.phone_validation_status ?? ''),
    phoneValidationReason: String(row.phone_validation_reason ?? ''),
    duplicateGroupSize: Number(row.duplicate_group_size ?? 0),
    decision: row.decision === 'included' ? 'included' : 'excluded',
    exclusionReason: row.exclusion_reason ? String(row.exclusion_reason) as StoredRecipientPreviewRow['exclusionReason'] : null,
    customFields: (row.custom_fields ?? {}) as Record<string, unknown>,
  }))
}
