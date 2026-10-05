import { errorMessage } from './errors'
import type { ContactComplianceStatus, EligibilityBlockReason, EligibilityState } from './consentSuppression'
import { collectPagedRows } from './pagedRpc'
import { supabase } from './supabase'

export type ConsentEventType = 'granted' | 'revoked'
export type ConsentSource = 'web_form' | 'paper_form' | 'verbal' | 'import' | 'api' | 'manual' | 'other'
export type SuppressionEventType = 'suppressed' | 'lifted'
export type SuppressionReason = 'opt_out' | 'complaint' | 'manual' | 'regulatory' | 'other'
export type SuppressionSource = 'recipient_reply' | 'import' | 'api' | 'manual' | 'other'


export interface ContactComplianceHistoryEvent {
  eventKind: 'consent' | 'suppression'
  eventId: number
  eventType: string
  source: string
  reason: string | null
  detail: string | null
  evidenceReference: string | null
  occurredAt: string
  expiresAt: string | null
  recordedBy: string | null
  createdAt: string
}

export interface RecipientEligibilityRow extends ContactComplianceStatus {
  previewRowId: number
  sourceRowNumber: number
  displayName: string | null
  sourceFilename: string
  previewRevision: number
}

export interface RecipientEligibilitySnapshotSummary {
  snapshotId: string
  recipientPreviewId: string
  revision: number
  policyVersion: string
  candidateRows: number
  eligibleRows: number
  noConsentRows: number
  consentRevokedRows: number
  consentExpiredRows: number
  suppressedRows: number
  createdAt: string
  createdBy: string | null
}

export interface StoredEligibilityRow {
  eligibilityRowId: number
  previewRowId: number
  sourceRowNumber: number
  displayName: string | null
  normalizedE164: string
  eligibilityState: EligibilityState
  blockReason: EligibilityBlockReason
  consentState: ContactComplianceStatus['consentState']
  consentSource: string | null
  consentOccurredAt: string | null
  consentExpiresAt: string | null
  suppressionState: ContactComplianceStatus['suppressionState']
  suppressionReason: string | null
  suppressionSource: string | null
  suppressionOccurredAt: string | null
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function mapCompliance(row: Record<string, unknown>): ContactComplianceStatus {
  return {
    normalizedE164: String(row.normalized_e164 ?? ''),
    consentState: String(row.consent_state ?? 'none') as ContactComplianceStatus['consentState'],
    consentEventId: row.consent_event_id == null ? null : Number(row.consent_event_id),
    consentSource: row.consent_source ? String(row.consent_source) : null,
    consentOccurredAt: row.consent_occurred_at ? String(row.consent_occurred_at) : null,
    consentExpiresAt: row.consent_expires_at ? String(row.consent_expires_at) : null,
    suppressionState: String(row.suppression_state ?? 'clear') as ContactComplianceStatus['suppressionState'],
    suppressionEventId: row.suppression_event_id == null ? null : Number(row.suppression_event_id),
    suppressionReason: row.suppression_reason ? String(row.suppression_reason) : null,
    suppressionSource: row.suppression_source ? String(row.suppression_source) : null,
    suppressionOccurredAt: row.suppression_occurred_at ? String(row.suppression_occurred_at) : null,
    eligibilityState: String(row.eligibility_state ?? 'blocked') as ContactComplianceStatus['eligibilityState'],
    blockReason: row.block_reason ? String(row.block_reason) as EligibilityBlockReason : null,
  }
}

export async function getContactComplianceStatus(organizationId: string, phone: string): Promise<ContactComplianceStatus> {
  const { data, error } = await client().rpc('get_contact_compliance_status', {
    p_organization_id: organizationId,
    p_phone: phone,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load consent/suppression status.'))
  const row = Array.isArray(data) ? data[0] : null
  if (!row) throw new Error('Consent/suppression lookup returned no result.')
  return mapCompliance(row as Record<string, unknown>)
}

export async function listContactComplianceStatuses(organizationId: string, limit = 100): Promise<ContactComplianceStatus[]> {
  const { data, error } = await client().rpc('list_contact_compliance_statuses', {
    p_organization_id: organizationId,
    p_limit: limit,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load consent/suppression records.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapCompliance)
}

export async function listContactComplianceHistory(organizationId: string, phone: string): Promise<ContactComplianceHistoryEvent[]> {
  const { data, error } = await client().rpc('list_contact_compliance_history', {
    p_organization_id: organizationId,
    p_phone: phone,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load consent/suppression evidence history.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    eventKind: String(row.event_kind) as ContactComplianceHistoryEvent['eventKind'],
    eventId: Number(row.event_id),
    eventType: String(row.event_type ?? ''),
    source: String(row.source ?? ''),
    reason: row.reason ? String(row.reason) : null,
    detail: row.detail ? String(row.detail) : null,
    evidenceReference: row.evidence_reference ? String(row.evidence_reference) : null,
    occurredAt: String(row.occurred_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    recordedBy: row.recorded_by ? String(row.recorded_by) : null,
    createdAt: String(row.created_at),
  }))
}

export async function recordContactConsent(input: {
  organizationId: string
  phone: string
  eventType: ConsentEventType
  source: ConsentSource
  evidenceNote?: string | null
  evidenceReference?: string | null
  occurredAt?: string | null
  expiresAt?: string | null
}): Promise<number> {
  const { data, error } = await client().rpc('record_contact_consent', {
    p_organization_id: input.organizationId,
    p_phone: input.phone,
    p_event_type: input.eventType,
    p_source: input.source,
    p_evidence_note: input.evidenceNote ?? null,
    p_evidence_reference: input.evidenceReference ?? null,
    p_occurred_at: input.occurredAt ?? null,
    p_expires_at: input.eventType === 'granted' ? input.expiresAt ?? null : null,
  })
  if (error) throw new Error(errorMessage(error, 'Could not record consent evidence.'))
  return Number(data)
}

export async function recordContactSuppression(input: {
  organizationId: string
  phone: string
  eventType: SuppressionEventType
  reason?: SuppressionReason | null
  source: SuppressionSource
  note?: string | null
  occurredAt?: string | null
}): Promise<number> {
  const { data, error } = await client().rpc('record_contact_suppression', {
    p_organization_id: input.organizationId,
    p_phone: input.phone,
    p_event_type: input.eventType,
    p_reason: input.eventType === 'suppressed' ? input.reason ?? null : null,
    p_source: input.source,
    p_note: input.note ?? null,
    p_occurred_at: input.occurredAt ?? null,
  })
  if (error) throw new Error(errorMessage(error, 'Could not update suppression state.'))
  return Number(data)
}

export async function listRecipientEligibilityRows(organizationId: string, previewId: string): Promise<RecipientEligibilityRow[]> {
  const rawRows = await collectPagedRows<Record<string, unknown>>(async (from, to) => {
    const { data, error } = await client().rpc('list_recipient_eligibility_rows', {
      p_organization_id: organizationId,
      p_preview_id: previewId,
    }).range(from, to)
    if (error) throw new Error(errorMessage(error, 'Could not evaluate recipient consent and suppression.'))
    return (data ?? []) as Array<Record<string, unknown>>
  })
  return rawRows.map((row) => ({
    ...mapCompliance(row),
    previewRowId: Number(row.preview_row_id),
    sourceRowNumber: Number(row.source_row_number),
    displayName: row.display_name ? String(row.display_name) : null,
    sourceFilename: String(row.source_filename ?? ''),
    previewRevision: Number(row.preview_revision ?? 0),
  }))
}

export async function createRecipientEligibilitySnapshot(organizationId: string, previewId: string): Promise<string> {
  const { data, error } = await client().rpc('create_recipient_eligibility_snapshot', {
    p_organization_id: organizationId,
    p_preview_id: previewId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not create consent/suppression eligibility snapshot.'))
  if (typeof data !== 'string' || !data) throw new Error('Eligibility snapshot returned an invalid identifier.')
  return data
}

export async function listRecipientEligibilitySnapshots(organizationId: string, previewId: string): Promise<RecipientEligibilitySnapshotSummary[]> {
  const { data, error } = await client().rpc('list_recipient_eligibility_snapshots', {
    p_organization_id: organizationId,
    p_preview_id: previewId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load eligibility snapshot history.'))
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    snapshotId: String(row.snapshot_id),
    recipientPreviewId: String(row.recipient_preview_id),
    revision: Number(row.revision),
    policyVersion: String(row.policy_version ?? ''),
    candidateRows: Number(row.candidate_rows),
    eligibleRows: Number(row.eligible_rows),
    noConsentRows: Number(row.no_consent_rows),
    consentRevokedRows: Number(row.consent_revoked_rows),
    consentExpiredRows: Number(row.consent_expired_rows),
    suppressedRows: Number(row.suppressed_rows),
    createdAt: String(row.created_at),
    createdBy: row.created_by ? String(row.created_by) : null,
  }))
}

export async function getRecipientEligibilitySnapshotRows(organizationId: string, snapshotId: string): Promise<StoredEligibilityRow[]> {
  const rawRows = await collectPagedRows<Record<string, unknown>>(async (from, to) => {
    const { data, error } = await client().rpc('get_recipient_eligibility_snapshot_rows', {
      p_organization_id: organizationId,
      p_snapshot_id: snapshotId,
    }).range(from, to)
    if (error) throw new Error(errorMessage(error, 'Could not load eligibility snapshot rows.'))
    return (data ?? []) as Array<Record<string, unknown>>
  })
  return rawRows.map((row) => ({
    eligibilityRowId: Number(row.eligibility_row_id),
    previewRowId: Number(row.preview_row_id),
    sourceRowNumber: Number(row.source_row_number),
    displayName: row.display_name ? String(row.display_name) : null,
    normalizedE164: String(row.normalized_e164 ?? ''),
    eligibilityState: String(row.eligibility_state ?? 'blocked') as EligibilityState,
    blockReason: row.block_reason ? String(row.block_reason) as EligibilityBlockReason : null,
    consentState: String(row.consent_state ?? 'none') as ContactComplianceStatus['consentState'],
    consentSource: row.consent_source ? String(row.consent_source) : null,
    consentOccurredAt: row.consent_occurred_at ? String(row.consent_occurred_at) : null,
    consentExpiresAt: row.consent_expires_at ? String(row.consent_expires_at) : null,
    suppressionState: String(row.suppression_state ?? 'clear') as ContactComplianceStatus['suppressionState'],
    suppressionReason: row.suppression_reason ? String(row.suppression_reason) : null,
    suppressionSource: row.suppression_source ? String(row.suppression_source) : null,
    suppressionOccurredAt: row.suppression_occurred_at ? String(row.suppression_occurred_at) : null,
  }))
}

export interface BulkConsentDeclarationResult {
  candidateRows: number
  newGrantEvents: number
  alreadyGrantedRows: number
  suppressedRows: number
}

export async function recordRecipientPreviewBulkConsent(input: {
  organizationId: string
  previewId: string
  source?: ConsentSource
  evidenceNote?: string | null
  evidenceReference?: string | null
  expiresAt?: string | null
}): Promise<BulkConsentDeclarationResult> {
  const { data, error } = await client().rpc('record_recipient_preview_bulk_consent', {
    p_organization_id: input.organizationId,
    p_preview_id: input.previewId,
    p_source: input.source ?? 'import',
    p_evidence_note: input.evidenceNote ?? null,
    p_evidence_reference: input.evidenceReference ?? null,
    p_expires_at: input.expiresAt ?? null,
  })
  if (error) throw new Error(errorMessage(error, 'Could not record bulk consent declaration.'))
  const row = (data ?? {}) as Record<string, unknown>
  return {
    candidateRows: Number(row.candidateRows ?? 0),
    newGrantEvents: Number(row.newGrantEvents ?? 0),
    alreadyGrantedRows: Number(row.alreadyGrantedRows ?? 0),
    suppressedRows: Number(row.suppressedRows ?? 0),
  }
}
