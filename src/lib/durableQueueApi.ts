import type { CampaignDispatch, CampaignDispatchStatus } from './durableQueue'
import { errorMessage } from './errors'
import { supabase } from './supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function mapDispatch(row: Record<string, unknown>): CampaignDispatch {
  return {
    dispatchId: String(row.dispatch_id),
    authorizationId: String(row.authorization_id ?? ''),
    status: String(row.status ?? 'queued') as CampaignDispatchStatus,
    enqueuedAt: String(row.enqueued_at),
    gatewayDeviceId: String(row.gateway_device_id),
    gatewaySimId: String(row.gateway_sim_id),
    simSubscriptionId: Number(row.sim_subscription_id),
    simSlotIndex: Number(row.sim_slot_index),
    recipientCount: Number(row.recipient_count),
    estimatedSmsUnits: Number(row.estimated_sms_units),
    queuedJobs: Number(row.queued_jobs),
    leasedJobs: Number(row.leased_jobs),
    downloadedJobs: Number(row.downloaded_jobs),
  }
}

export async function getCampaignDispatch(organizationId: string, campaignId: string): Promise<CampaignDispatch | null> {
  const { data, error } = await client().rpc('get_campaign_dispatch', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not load durable queue status.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  return row ? mapDispatch(row) : null
}

export async function enqueueCampaignDispatch(organizationId: string, campaignId: string, authorizationId: string): Promise<CampaignDispatch> {
  const { data, error } = await client().rpc('enqueue_campaign_dispatch', {
    p_organization_id: organizationId,
    p_campaign_id: campaignId,
    p_authorization_id: authorizationId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not create the durable cloud queue.'))
  const row = ((data ?? []) as Record<string, unknown>[])[0]
  if (!row) throw new Error('Durable queue response was incomplete.')
  return mapDispatch(row)
}
