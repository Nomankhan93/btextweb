import { errorMessage } from './errors'
import type { PersonalizationSourceRow } from './messageComposer'
import { supabase } from './supabase'

export interface MessageComposerSource {
  eligibilitySnapshotId: string
  recipientPreviewId: string
  eligibilityRevision: number
  eligibilityPolicyVersion: string
  candidateRows: number
  eligibleRows: number
  sourceFilename: string
  previewRevision: number
  snapshotCreatedAt: string
}

export interface MessageComposerDraft {
  draftId: string
  eligibilitySnapshotId: string
  title: string
  messageTemplate: string
  syntaxVersion: string
  templateVariables: string[]
  eligibleRows: number
  sourceFilename: string
  eligibilityRevision: number
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function listMessageComposerSources(organizationId: string): Promise<MessageComposerSource[]> {
  const { data, error } = await client().rpc('list_message_composer_sources', { p_organization_id: organizationId })
  if (error) throw new Error(errorMessage(error, 'Could not load eligibility snapshots for the message composer.'))
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    eligibilitySnapshotId: String(row.eligibility_snapshot_id),
    recipientPreviewId: String(row.recipient_preview_id),
    eligibilityRevision: Number(row.eligibility_revision),
    eligibilityPolicyVersion: String(row.eligibility_policy_version),
    candidateRows: Number(row.candidate_rows),
    eligibleRows: Number(row.eligible_rows),
    sourceFilename: String(row.source_filename ?? 'Import'),
    previewRevision: Number(row.preview_revision),
    snapshotCreatedAt: String(row.snapshot_created_at),
  }))
}

export async function getMessagePersonalizationSourceRows(organizationId: string, eligibilitySnapshotId: string): Promise<PersonalizationSourceRow[]> {
  const { data, error } = await client().rpc('get_message_personalization_source_rows', {
    p_organization_id: organizationId,
    p_eligibility_snapshot_id: eligibilitySnapshotId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load eligible personalization source rows.'))
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    eligibilityRowId: Number(row.eligibility_row_id),
    previewRowId: Number(row.preview_row_id),
    sourceRowNumber: Number(row.source_row_number),
    displayName: row.display_name == null ? null : String(row.display_name),
    firstName: row.first_name == null ? null : String(row.first_name),
    lastName: row.last_name == null ? null : String(row.last_name),
    normalizedE164: String(row.normalized_e164),
    customFields: (row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {}) as Record<string, unknown>,
  }))
}

export async function listMessageComposerDrafts(organizationId: string): Promise<MessageComposerDraft[]> {
  const { data, error } = await client().rpc('list_message_composer_drafts', { p_organization_id: organizationId })
  if (error) throw new Error(errorMessage(error, 'Could not load message drafts.'))
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    draftId: String(row.draft_id),
    eligibilitySnapshotId: String(row.eligibility_snapshot_id),
    title: String(row.title),
    messageTemplate: String(row.message_template),
    syntaxVersion: String(row.syntax_version),
    templateVariables: Array.isArray(row.template_variables) ? row.template_variables.map(String) : [],
    eligibleRows: Number(row.eligible_rows),
    sourceFilename: String(row.source_filename ?? 'Import'),
    eligibilityRevision: Number(row.eligibility_revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: row.created_by == null ? null : String(row.created_by),
    updatedBy: row.updated_by == null ? null : String(row.updated_by),
  }))
}

export async function saveMessageComposerDraft(input: {
  organizationId: string
  draftId: string | null
  eligibilitySnapshotId: string
  title: string
  messageTemplate: string
}): Promise<string> {
  const { data, error } = await client().rpc('save_message_composer_draft', {
    p_organization_id: input.organizationId,
    p_draft_id: input.draftId,
    p_eligibility_snapshot_id: input.eligibilitySnapshotId,
    p_title: input.title,
    p_message_template: input.messageTemplate,
  })
  if (error) throw new Error(errorMessage(error, 'Could not save message draft.'))
  return String(data)
}

export async function deleteMessageComposerDraft(organizationId: string, draftId: string): Promise<void> {
  const { error } = await client().rpc('delete_message_composer_draft', {
    p_organization_id: organizationId,
    p_draft_id: draftId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not delete message draft.'))
}
