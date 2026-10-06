import { describe, expect, it } from 'vitest'
import { deliveryProgress, deliverySummary, sentProgress, type CampaignDeliveryStatus } from '../lib/deliveryAttempts'

const status: CampaignDeliveryStatus = {
  dispatchId: 'dispatch', recipientCount: 10, awaitingAttemptJobs: 2, preparedJobs: 0, submittedJobs: 1,
  sentJobs: 3, deliveredJobs: 4, failedJobs: 0, unknownJobs: 0, unresolvedUnknownJobs: 0,
  retryableFailedJobs: 0, recoveryRequestedJobs: 0, latestAttemptAt: null,
}

describe('0.18 delivery status', () => {
  it('separates SENT from DELIVERED progress', () => {
    expect(sentProgress(status)).toBe(70)
    expect(deliveryProgress(status)).toBe(40)
  })

  it('never calls UNKNOWN retryable', () => {
    const unknown = { ...status, unknownJobs: 1, unresolvedUnknownJobs: 1, failedJobs: 0, retryableFailedJobs: 0 }
    expect(deliverySummary(unknown)).toContain('No automatic retry')
  })

  it('keeps resolved UNKNOWN visible without pretending it was sent', () => {
    const resolved = { ...status, unknownJobs: 1, unresolvedUnknownJobs: 0, awaitingAttemptJobs: 0, submittedJobs: 0, sentJobs: 0, deliveredJobs: 0 }
    expect(deliverySummary(resolved)).toContain('resolved without resend')
    expect(deliverySummary(resolved)).toContain('No SENT/DELIVERED claim')
  })

  it('surfaces only explicit safe-retry failures', () => {
    const failed = { ...status, failedJobs: 2, retryableFailedJobs: 2, unresolvedUnknownJobs: 0 }
    expect(deliverySummary(failed)).toContain('explicit safe retry')
  })
})
