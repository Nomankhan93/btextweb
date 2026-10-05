import { errorMessage } from './errors'
import type { CampaignSendAuthorization, CampaignSendAuthorizationStatus, CampaignSendPreflight, CampaignSendPreflightStatus } from './gatewayPreflight'
import { supabase } from './supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value)
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value)
}

function mapPreflight(row: Record<string, unknown>): CampaignSendPreflight {
  return {
    ready: row.ready === true,
    status: String(row.status) as CampaignSendPreflightStatus,
    blockerCodes: stringArray(row.blocker_codes),
    blockers: stringArray(row.blockers),
    serverTime: String(row.server_time),
    campaignId: String(row.campaign_id),
    gatewayDeviceId: String(row.gateway_device_id),
    gatewaySimId: String(row.gateway_sim_id),
    currentSubscriptionId: nullableNumber(row.current_subscription_id),
    currentSlotIndex: nullableNumber(row.current_slot_index),
    currentSimIdentityHash: nullableString(row.current_sim_identity_hash),
    deviceLastSeenAt: nullableString(row.device_last_seen_at),
    inventoryLastSeenAt: nullableString(row.inventory_last_seen_at),
    credentialExpiresAt: nullableString(row.credential_expires_at),
    recipientCount: Number(row.recipient_count),
    currentEligibleRecipients: Number(row.current_eligible_recipients),
    blockedRecipients: Number(row.blocked_recipients),
  }
}

function mapAuthorization(row: Record<string, unknown>): CampaignSendAuthorization {
  return {
    authorizationId: String(row.authorization_id),
    authorizedAt: String(row.authorized_at),
    expiresAt: String(row.expires_at),
    revokedAt: nullableString(row.revoked_at),
    revocationReason: nullableString(row.revocation_reason),
    status: String(row.status) as CampaignSendAuthorizationStatus,
    gatewayDeviceId: String(row.gateway_device_id),
    gatewaySimId: String(row.gateway_sim_id),
    simSubscriptionId: Number(row.sim_subscription_id),
    simSlotIndex: Number(row.sim_slot_index),
  }
}

export async function getCampaignSendPreflight(organizationId: string, campaignId: string): Promise<CampaignSendPreflight> {
  const { data, error } = await client().rpc('get_campaign_send_preflight', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not run gateway preflight.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  if (!row) throw new Error('Gateway preflight response was incomplete.')
  return mapPreflight(row)
}

export async function authorizeCampaignSend(organizationId: string, campaignId: string): Promise<CampaignSendAuthorization> {
  const { data, error } = await client().rpc('authorize_campaign_send', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not authorize this campaign.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  if (!row) throw new Error('Send authorization response was incomplete.')
  return mapAuthorization(row)
}

export async function getLatestCampaignSendAuthorization(organizationId: string, campaignId: string): Promise<CampaignSendAuthorization | null> {
  const { data, error } = await client().rpc('get_latest_campaign_send_authorization', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load send authorization.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  return row ? mapAuthorization(row) : null
}

export async function revokeCampaignSendAuthorization(organizationId: string, campaignId: string, authorizationId: string): Promise<boolean> {
  const { data, error } = await client().rpc('revoke_campaign_send_authorization', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_authorization_id: authorizationId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not revoke send authorization.'))
  return data === true
}
