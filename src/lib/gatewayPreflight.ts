export type CampaignSendPreflightStatus = 'ready' | 'blocked'
export type CampaignSendAuthorizationStatus = 'authorized' | 'expired' | 'revoked' | 'consumed'

export interface CampaignSendPreflight {
  ready: boolean
  status: CampaignSendPreflightStatus
  blockerCodes: string[]
  blockers: string[]
  serverTime: string
  campaignId: string
  gatewayDeviceId: string
  gatewaySimId: string
  currentSubscriptionId: number | null
  currentSlotIndex: number | null
  currentSimIdentityHash: string | null
  deviceLastSeenAt: string | null
  inventoryLastSeenAt: string | null
  credentialExpiresAt: string | null
  recipientCount: number
  currentEligibleRecipients: number
  blockedRecipients: number
}

export interface CampaignSendAuthorization {
  authorizationId: string
  authorizedAt: string
  expiresAt: string
  revokedAt: string | null
  revocationReason: string | null
  status: CampaignSendAuthorizationStatus
  gatewayDeviceId: string
  gatewaySimId: string
  simSubscriptionId: number
  simSlotIndex: number
}

export function authorizationIsActive(authorization: CampaignSendAuthorization | null, now = new Date()): boolean {
  if (!authorization || authorization.status !== 'authorized' || authorization.revokedAt) return false
  const expiresAt = new Date(authorization.expiresAt).getTime()
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

export function canAuthorizeCampaign(preflight: CampaignSendPreflight | null, authorization: CampaignSendAuthorization | null, now = new Date()): boolean {
  return Boolean(preflight?.ready) && !authorizationIsActive(authorization, now)
}

export function preflightSummary(preflight: CampaignSendPreflight | null): string {
  if (!preflight) return 'Preflight has not run yet.'
  if (preflight.ready) return `Ready · ${preflight.currentEligibleRecipients.toLocaleString()} recipients currently eligible.`
  if (preflight.blockers.length === 1) return preflight.blockers[0]
  return `${preflight.blockers.length} send-safety checks are blocking authorization.`
}
