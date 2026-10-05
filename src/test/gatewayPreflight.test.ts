import { describe, expect, it } from 'vitest'
import { authorizationIsActive, canAuthorizeCampaign, preflightSummary, type CampaignSendAuthorization, type CampaignSendPreflight } from '../lib/gatewayPreflight'

const preflight: CampaignSendPreflight = {
  ready: true,
  status: 'ready',
  blockerCodes: [],
  blockers: [],
  serverTime: '2026-10-04T19:00:00Z',
  campaignId: 'campaign',
  gatewayDeviceId: 'device',
  gatewaySimId: 'sim',
  currentSubscriptionId: 1,
  currentSlotIndex: 0,
  currentSimIdentityHash: 'a'.repeat(64),
  deviceLastSeenAt: '2026-10-04T18:59:00Z',
  inventoryLastSeenAt: '2026-10-04T18:59:00Z',
  credentialExpiresAt: '2026-12-01T00:00:00Z',
  recipientCount: 2,
  currentEligibleRecipients: 2,
  blockedRecipients: 0,
}

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

describe('gateway preflight and send authorization UI rules', () => {
  it('allows authorization only when the server preflight is ready', () => {
    expect(canAuthorizeCampaign(preflight, null, new Date('2026-10-04T19:01:00Z'))).toBe(true)
    expect(canAuthorizeCampaign({ ...preflight, ready: false, status: 'blocked' }, null, new Date('2026-10-04T19:01:00Z'))).toBe(false)
  })

  it('does not offer a duplicate authorization while the current one is active', () => {
    expect(authorizationIsActive(authorization, new Date('2026-10-04T19:04:59Z'))).toBe(true)
    expect(canAuthorizeCampaign(preflight, authorization, new Date('2026-10-04T19:04:59Z'))).toBe(false)
  })

  it('treats expired or revoked authorization as inactive', () => {
    expect(authorizationIsActive(authorization, new Date('2026-10-04T19:05:00Z'))).toBe(false)
    expect(authorizationIsActive({ ...authorization, status: 'revoked', revokedAt: '2026-10-04T19:02:00Z' }, new Date('2026-10-04T19:02:01Z'))).toBe(false)
  })

  it('surfaces server blockers instead of inferring a fallback SIM', () => {
    const blocked = {
      ...preflight,
      ready: false,
      status: 'blocked' as const,
      blockerCodes: ['sim_missing'],
      blockers: ['The exact SIM confirmed for this campaign is missing. BulkText will not fall back to another SIM.'],
    }
    expect(preflightSummary(blocked)).toMatch(/will not fall back/i)
  })
})
