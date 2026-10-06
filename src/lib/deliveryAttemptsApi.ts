import type { CampaignDeliveryStatus, CampaignMessageAttempt, MessageRecoveryAction } from './deliveryAttempts'
import { errorMessage } from './errors'
import { supabase } from './supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function nullableString(value: unknown): string | null {
  return value == null || String(value).trim() === '' ? null : String(value)
}

function mapStatus(row: Record<string, unknown>): CampaignDeliveryStatus {
  return {
    dispatchId: String(row.dispatch_id),
    recipientCount: Number(row.recipient_count),
    awaitingAttemptJobs: Number(row.awaiting_attempt_jobs),
    preparedJobs: Number(row.prepared_jobs),
    submittedJobs: Number(row.submitted_jobs),
    sentJobs: Number(row.sent_jobs),
    deliveredJobs: Number(row.delivered_jobs),
    failedJobs: Number(row.failed_jobs),
    unknownJobs: Number(row.unknown_jobs),
    unresolvedUnknownJobs: Number(row.unresolved_unknown_jobs),
    retryableFailedJobs: Number(row.retryable_failed_jobs),
    recoveryRequestedJobs: Number(row.recovery_requested_jobs),
    latestAttemptAt: nullableString(row.latest_attempt_at),
  }
}

function mapAttempt(row: Record<string, unknown>): CampaignMessageAttempt {
  return {
    attemptId: String(row.attempt_id),
    jobId: String(row.job_id),
    sourceRowNumber: Number(row.source_row_number),
    normalizedE164: String(row.normalized_e164),
    attemptNumber: Number(row.attempt_number),
    state: String(row.state) as CampaignMessageAttempt['state'],
    safeRetryEligible: Boolean(row.safe_retry_eligible),
    terminalReason: nullableString(row.terminal_reason),
    submittedAt: nullableString(row.submitted_at),
    sentAt: nullableString(row.sent_at),
    deliveredAt: nullableString(row.delivered_at),
    failedAt: nullableString(row.failed_at),
    unknownAt: nullableString(row.unknown_at),
    resolvedAt: nullableString(row.resolved_at),
    resolution: nullableString(row.resolution) as CampaignMessageAttempt['resolution'],
    createdAt: String(row.created_at),
  }
}

export async function getCampaignDeliveryStatus(organizationId: string, campaignId: string): Promise<CampaignDeliveryStatus | null> {
  const { data, error } = await client().rpc('get_campaign_delivery_status', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load SMS delivery status.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  return row ? mapStatus(row) : null
}

export async function listCampaignMessageAttempts(organizationId: string, campaignId: string, limit = 100): Promise<CampaignMessageAttempt[]> {
  const { data, error } = await client().rpc('list_campaign_message_attempts', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_limit: Math.min(Math.max(limit, 1), 500),
  })
  if (error) throw new Error(errorMessage(error, 'Could not load SMS attempt history.'))
  return ((data ?? []) as Record<string, unknown>[]).map(mapAttempt)
}

export async function requestCampaignMessageRecovery(
  organizationId: string,
  campaignId: string,
  action: MessageRecoveryAction,
): Promise<number> {
  const { data, error } = await client().rpc('request_campaign_message_recovery', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_action: action,
  })
  if (error) throw new Error(errorMessage(error, 'Could not request SMS recovery.'))
  return Number(data ?? 0)
}
