export type MessageAttemptState = 'prepared' | 'submitted' | 'sent' | 'delivered' | 'failed' | 'unknown'
export type MessageRecoveryAction = 'safe_retry' | 'skip_unknown'

export interface CampaignDeliveryStatus {
  dispatchId: string
  recipientCount: number
  awaitingAttemptJobs: number
  preparedJobs: number
  submittedJobs: number
  sentJobs: number
  deliveredJobs: number
  failedJobs: number
  unknownJobs: number
  unresolvedUnknownJobs: number
  retryableFailedJobs: number
  recoveryRequestedJobs: number
  latestAttemptAt: string | null
}

export interface CampaignMessageAttempt {
  attemptId: string
  jobId: string
  sourceRowNumber: number
  normalizedE164: string
  attemptNumber: number
  state: MessageAttemptState
  safeRetryEligible: boolean
  terminalReason: string | null
  submittedAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  unknownAt: string | null
  resolvedAt: string | null
  resolution: 'skip_without_retry' | null
  createdAt: string
}

export function deliveryProgress(status: CampaignDeliveryStatus | null): number {
  if (!status || status.recipientCount <= 0) return 0
  return Math.min(100, Math.max(0, (status.deliveredJobs / status.recipientCount) * 100))
}

export function sentProgress(status: CampaignDeliveryStatus | null): number {
  if (!status || status.recipientCount <= 0) return 0
  const knownSent = status.sentJobs + status.deliveredJobs
  return Math.min(100, Math.max(0, (knownSent / status.recipientCount) * 100))
}

export function deliverySummary(status: CampaignDeliveryStatus | null): string {
  if (!status) return 'Waiting for Android attempt/callback status.'
  if (status.unresolvedUnknownJobs > 0) {
    return `${status.unresolvedUnknownJobs.toLocaleString()} UNKNOWN job${status.unresolvedUnknownJobs === 1 ? '' : 's'} require recovery. No automatic retry is permitted.`
  }
  if (status.failedJobs > 0) {
    return `${status.failedJobs.toLocaleString()} failed job${status.failedJobs === 1 ? '' : 's'} require review. 0.18.1 does not authorize callback-derived resend.`
  }
  const resolvedUnknown = Math.max(0, status.unknownJobs - status.unresolvedUnknownJobs)
  if (resolvedUnknown > 0) {
    return `${resolvedUnknown.toLocaleString()} UNKNOWN job${resolvedUnknown === 1 ? '' : 's'} resolved without resend. No SENT/DELIVERED claim is made for those recipients.`
  }
  if (status.deliveredJobs === status.recipientCount && status.recipientCount > 0) {
    return `Delivered · ${status.deliveredJobs.toLocaleString()} of ${status.recipientCount.toLocaleString()} recipients reported DELIVERED.`
  }
  if (status.sentJobs + status.deliveredJobs > 0) {
    return `Sent · ${(status.sentJobs + status.deliveredJobs).toLocaleString()} known sent, ${status.deliveredJobs.toLocaleString()} delivered.`
  }
  if (status.submittedJobs > 0 || status.preparedJobs > 0) {
    return `Sending · ${status.submittedJobs.toLocaleString()} submitted, ${status.preparedJobs.toLocaleString()} prepared.`
  }
  return `${status.awaitingAttemptJobs.toLocaleString()} job${status.awaitingAttemptJobs === 1 ? '' : 's'} waiting for Android execution.`
}

export function attemptBadgeClass(state: MessageAttemptState): string {
  if (state === 'delivered' || state === 'sent') return 'badge-success'
  if (state === 'failed' || state === 'unknown') return 'badge-warning'
  return 'badge-muted'
}
