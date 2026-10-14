import { useState } from 'react'
import { getCampaignDispatch } from './durableQueueApi'
import type { CampaignDispatch } from './durableQueue'
import { getCampaignContractHealth, getCampaignDeliveryStatus, listCampaignMessageAttempts } from './deliveryAttemptsApi'
import type { CampaignDeliveryStatus, CampaignMessageAttempt } from './deliveryAttempts'
import type { DeliveryContractHealth } from './deliveryContract'
import { useAdaptivePoll } from './useAdaptivePoll'
export const CAMPAIGN_POLL_MS = 5000
export const CAMPAIGN_IDLE_POLL_MS = 30_000
/** Caller keys the component by workspace + campaign. Reads never send SMS. */
export function useCampaignLiveStatus(workspaceId: string, campaignId: string, paused: boolean) {
  const [dispatch, setDispatch] = useState<CampaignDispatch | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState<CampaignDeliveryStatus | null>(null)
  const [attempts, setAttempts] = useState<CampaignMessageAttempt[]>([])
  const [contractHealth, setContractHealth] = useState<DeliveryContractHealth | null>(null)
  const [loaded, setLoaded] = useState(false)
  const poll = useAdaptivePoll(`${workspaceId}:${campaignId}`, paused, async signal => {
    const [status, history, health] = await Promise.all([
      getCampaignDeliveryStatus(workspaceId, campaignId, signal),
      listCampaignMessageAttempts(workspaceId, campaignId, 100, signal),
      getCampaignContractHealth(workspaceId, campaignId, signal),
    ])
    // Queue read follows callback reads. Separate RPCs are not a fixed DB snapshot.
    signal.throwIfAborted()
    const queue = await getCampaignDispatch(workspaceId, campaignId, signal)
    return { status, history, health, queue }
  }, ({ status, history, health, queue }) => {
    setDispatch(queue); setDeliveryStatus(queue ? status : null)
    setAttempts(queue ? history : []); setContractHealth(queue ? health : null); setLoaded(true)
  }, ({ queue, status }) => queue && (queue.queuedJobs > 0 || queue.leasedJobs > 0 ||
    !status || status.awaitingAttemptJobs > 0 || status.preparedJobs > 0 || status.submittedJobs > 0 || status.sentJobs > 0)
    ? CAMPAIGN_POLL_MS : CAMPAIGN_IDLE_POLL_MS)
  return { dispatch, setDispatch, deliveryStatus, attempts, contractHealth, loaded, ...poll }
}
