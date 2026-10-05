import { describe, expect, it } from 'vitest'
import { campaignConfirmationReadiness, campaignEncodingSummary } from '../lib/campaignConfirmation'
import type { GatewayDeviceSummary } from '../lib/gatewayDevices'
import type { CampaignSmsUsageEstimate } from '../lib/smsSegments'

const usage: CampaignSmsUsageEstimate = {
  recipientCount: 2, readyRecipients: 2, blockedRecipients: 0, estimatedSmsUnits: 3,
  averageSegments: 1.5, minimumSegments: 1, maximumSegments: 2, gsm7Recipients: 2,
  unicodeRecipients: 0, encodingSummary: 'GSM-7', longMessageRecipients: 0, recipients: [],
}

const device = {
  deviceId: 'device', displayName: 'Phone', platform: 'android', status: 'active', credentialVersion: 1,
  credentialExpiresAt: null, pairedAt: '', lastSeenAt: null, revokedAt: null, manufacturer: null, model: null,
  androidRelease: null, sdkInt: null, appVersion: null, appVersionCode: null, batteryPercent: null, lastInventoryAt: null,
  healthStatus: 'recent', boundSimId: 'sim', boundSubscriptionId: 1, boundSlotIndex: 0, boundCarrierName: 'Ufone', bindingStatus: 'ready', sims: [],
} satisfies GatewayDeviceSummary

describe('campaign confirmation readiness', () => {
  it('allows a saved, fully-renderable draft with an active phone and selected SIM', () => {
    expect(campaignConfirmationReadiness({ draftId: 'draft', smsUsage: usage, device })).toEqual({ ready: true, blockers: [] })
  })

  it('blocks missing personalization and missing SIM binding', () => {
    const result = campaignConfirmationReadiness({
      draftId: 'draft',
      smsUsage: { ...usage, readyRecipients: 1, blockedRecipients: 1 },
      device: { ...device, boundSimId: null, bindingStatus: 'unbound' },
    })
    expect(result.ready).toBe(false)
    expect(result.blockers.join(' ')).toMatch(/personalization/i)
    expect(result.blockers.join(' ')).toMatch(/SIM/i)
  })
})

describe('campaign encoding summary', () => {
  it('distinguishes GSM-7, Unicode and mixed campaigns', () => {
    expect(campaignEncodingSummary(2, 0, 2)).toBe('GSM-7')
    expect(campaignEncodingSummary(0, 2, 2)).toBe('Unicode')
    expect(campaignEncodingSummary(1, 1, 2)).toBe('Mixed')
  })
})
