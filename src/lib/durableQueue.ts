import { authorizationIsActive, type CampaignSendAuthorization } from './gatewayPreflight'

export type CampaignDispatchStatus = 'queued' | 'leasing' | 'downloaded'

export interface CampaignDispatch {
  dispatchId: string
  authorizationId: string
  status: CampaignDispatchStatus
  enqueuedAt: string
  gatewayDeviceId: string
  gatewaySimId: string
  simSubscriptionId: number
  simSlotIndex: number
  recipientCount: number
  estimatedSmsUnits: number
  queuedJobs: number
  leasedJobs: number
  downloadedJobs: number
}

export function canCreateDurableQueue(
  authorization: CampaignSendAuthorization | null,
  dispatch: CampaignDispatch | null,
  now = new Date(),
): boolean {
  return !dispatch && authorizationIsActive(authorization, now)
}

export function dispatchProgress(dispatch: CampaignDispatch): number {
  if (dispatch.recipientCount <= 0) return 0
  return Math.min(100, Math.max(0, (dispatch.downloadedJobs / dispatch.recipientCount) * 100))
}

export function dispatchSummary(dispatch: CampaignDispatch | null): string {
  if (!dispatch) return 'No durable queue has been created.'
  if (dispatch.downloadedJobs === dispatch.recipientCount) return `Downloaded · ${dispatch.downloadedJobs.toLocaleString()} jobs durably ACKed by Android.`
  if (dispatch.leasedJobs > 0) return `Leasing · ${dispatch.leasedJobs.toLocaleString()} leased, ${dispatch.downloadedJobs.toLocaleString()} downloaded.`
  return `Queued · ${dispatch.queuedJobs.toLocaleString()} jobs waiting for the assigned Android gateway.`
}
