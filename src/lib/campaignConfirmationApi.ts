import { errorMessage } from './errors'
import { supabase } from './supabase'

export interface ConfirmedCampaignSummary {
  campaignId: string
  title: string
  recipientCount: number
  estimatedSmsUnits: number
  encodingSummary: string
  minimumSegments: number
  maximumSegments: number
  gatewayDeviceName: string
  simCarrierName: string | null
  simSlotIndex: number
  confirmedAt: string
}

export interface CampaignConfirmationDetail {
  campaignId: string
  title: string
  sourceDraftId: string | null
  sourceDraftUpdatedAt: string
  sourceEligibilitySnapshotId: string | null
  messageTemplateSnapshot: string
  templateSyntaxVersion: string
  eligibilityPolicyVersion: string
  smsSegmentModelVersion: string
  recipientCount: number
  estimatedSmsUnits: number
  gsm7Recipients: number
  unicodeRecipients: number
  minimumSegments: number
  maximumSegments: number
  averageSegments: number
  gatewayDeviceId: string
  gatewayDeviceName: string
  gatewayManufacturer: string | null
  gatewayModel: string | null
  gatewayLastSeenAt: string | null
  gatewayLastInventoryAt: string | null
  gatewaySimId: string
  simSubscriptionId: number
  simSlotIndex: number
  simCarrierName: string | null
  simDisplayName: string | null
  confirmedAt: string
}

export interface CampaignConfirmationRecipient {
  recipientId: number
  sourceRowNumber: number
  displayName: string | null
  normalizedE164: string
  renderedMessage: string
  smsEncoding: 'GSM-7' | 'Unicode'
  characterCount: number
  encodingUnits: number
  segmentCount: number
  consentState: string
  consentSource: string | null
  consentOccurredAt: string | null
  consentExpiresAt: string | null
  suppressionState: string
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function confirmCampaign(organizationId: string, draftId: string, deviceId: string): Promise<string> {
  const { data, error } = await client().rpc('confirm_campaign', {
    p_organization_id: organizationId,
    p_draft_id: draftId,
    p_device_id: deviceId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not confirm the campaign.'))
  if (!data) throw new Error('Campaign confirmation response was incomplete.')
  return String(data)
}

export async function listCampaignConfirmations(organizationId: string): Promise<ConfirmedCampaignSummary[]> {
  const { data, error } = await client().rpc('list_campaign_confirmations', { p_organization_id: organizationId })
  if (error) throw new Error(errorMessage(error, 'Could not load confirmed campaigns.'))
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    campaignId: String(row.campaign_id),
    title: String(row.title),
    recipientCount: Number(row.recipient_count),
    estimatedSmsUnits: Number(row.estimated_sms_units),
    encodingSummary: String(row.encoding_summary ?? '—'),
    minimumSegments: Number(row.minimum_segments),
    maximumSegments: Number(row.maximum_segments),
    gatewayDeviceName: String(row.gateway_device_name),
    simCarrierName: row.sim_carrier_name == null ? null : String(row.sim_carrier_name),
    simSlotIndex: Number(row.sim_slot_index),
    confirmedAt: String(row.confirmed_at),
  }))
}

export async function getCampaignConfirmation(organizationId: string, campaignId: string): Promise<CampaignConfirmationDetail> {
  const { data, error } = await client().rpc('get_campaign_confirmation', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load the campaign confirmation.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  if (!row) throw new Error('Campaign confirmation was not found.')
  return {
    campaignId: String(row.campaign_id), title: String(row.title), sourceDraftId: row.source_draft_id == null ? null : String(row.source_draft_id),
    sourceDraftUpdatedAt: String(row.source_draft_updated_at), sourceEligibilitySnapshotId: row.source_eligibility_snapshot_id == null ? null : String(row.source_eligibility_snapshot_id),
    messageTemplateSnapshot: String(row.message_template_snapshot), templateSyntaxVersion: String(row.template_syntax_version), eligibilityPolicyVersion: String(row.eligibility_policy_version),
    smsSegmentModelVersion: String(row.sms_segment_model_version), recipientCount: Number(row.recipient_count), estimatedSmsUnits: Number(row.estimated_sms_units),
    gsm7Recipients: Number(row.gsm7_recipients), unicodeRecipients: Number(row.unicode_recipients), minimumSegments: Number(row.minimum_segments), maximumSegments: Number(row.maximum_segments),
    averageSegments: Number(row.average_segments), gatewayDeviceId: String(row.gateway_device_id), gatewayDeviceName: String(row.gateway_device_name),
    gatewayManufacturer: row.gateway_manufacturer == null ? null : String(row.gateway_manufacturer), gatewayModel: row.gateway_model == null ? null : String(row.gateway_model),
    gatewayLastSeenAt: row.gateway_last_seen_at == null ? null : String(row.gateway_last_seen_at), gatewayLastInventoryAt: row.gateway_last_inventory_at == null ? null : String(row.gateway_last_inventory_at),
    gatewaySimId: String(row.gateway_sim_id), simSubscriptionId: Number(row.sim_subscription_id), simSlotIndex: Number(row.sim_slot_index),
    simCarrierName: row.sim_carrier_name == null ? null : String(row.sim_carrier_name), simDisplayName: row.sim_display_name == null ? null : String(row.sim_display_name), confirmedAt: String(row.confirmed_at),
  }
}

export async function listCampaignConfirmationRecipients(organizationId: string, campaignId: string, limit = 100, offset = 0): Promise<CampaignConfirmationRecipient[]> {
  const { data, error } = await client().rpc('list_campaign_confirmation_recipients', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load confirmed recipients.'))
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    recipientId: Number(row.recipient_id), sourceRowNumber: Number(row.source_row_number), displayName: row.display_name == null ? null : String(row.display_name),
    normalizedE164: String(row.normalized_e164), renderedMessage: String(row.rendered_message), smsEncoding: String(row.sms_encoding) as 'GSM-7' | 'Unicode',
    characterCount: Number(row.character_count), encodingUnits: Number(row.encoding_units), segmentCount: Number(row.segment_count), consentState: String(row.consent_state),
    consentSource: row.consent_source == null ? null : String(row.consent_source), consentOccurredAt: row.consent_occurred_at == null ? null : String(row.consent_occurred_at),
    consentExpiresAt: row.consent_expires_at == null ? null : String(row.consent_expires_at), suppressionState: String(row.suppression_state),
  }))
}
