import { describe, expect, it } from 'vitest'
import { canCreateDurableQueue, dispatchProgress, dispatchSummary, type CampaignDispatch } from '../lib/durableQueue'
import type { CampaignSendAuthorization } from '../lib/gatewayPreflight'

const authorization: CampaignSendAuthorization = {
  authorizationId: 'authorization',
  authorizedAt: '2026-10-04T19:00:00Z',
  expiresAt: '2026-10-04T19:05:00Z',
  revokedAt: null,
  revocationReason: null,
  status: 'authorized',
  gatewayDeviceId: 'device',
  gatewaySimId: 'sim',
  simSubscriptionId: 1,
  simSlotIndex: 0,
}

const dispatch: CampaignDispatch = {
  dispatchId: 'dispatch', authorizationId: 'authorization', status: 'queued', enqueuedAt: '2026-10-04T19:01:00Z',
  gatewayDeviceId: 'device', gatewaySimId: 'sim', simSubscriptionId: 1, simSlotIndex: 0,
  recipientCount: 100, estimatedSmsUnits: 120, queuedJobs: 80, leasedJobs: 10, downloadedJobs: 10,
}

describe('durable cloud queue UI rules', () => {
  it('requires a fresh authorization and no existing dispatch', () => {
    expect(canCreateDurableQueue(authorization, null, new Date('2026-10-04T19:04:59Z'))).toBe(true)
    expect(canCreateDurableQueue(authorization, dispatch, new Date('2026-10-04T19:04:59Z'))).toBe(false)
  })

  it('rejects expired, revoked or consumed authorization', () => {
    expect(canCreateDurableQueue(authorization, null, new Date('2026-10-04T19:05:00Z'))).toBe(false)
    expect(canCreateDurableQueue({ ...authorization, status: 'revoked', revokedAt: '2026-10-04T19:01:00Z' }, null)).toBe(false)
    expect(canCreateDurableQueue({ ...authorization, status: 'consumed' }, null)).toBe(false)
  })

  it('reports downloaded progress without treating leased work as downloaded', () => {
    expect(dispatchProgress(dispatch)).toBe(10)
  })

  it('summarizes queue, leasing and fully downloaded states', () => {
    expect(dispatchSummary({ ...dispatch, leasedJobs: 0 })).toContain('Queued')
    expect(dispatchSummary(dispatch)).toContain('Leasing')
    expect(dispatchSummary({ ...dispatch, queuedJobs: 0, leasedJobs: 0, downloadedJobs: 100, status: 'downloaded' })).toContain('Downloaded')
  })
})
