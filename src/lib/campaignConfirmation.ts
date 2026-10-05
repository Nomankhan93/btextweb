import type { CampaignSmsUsageEstimate } from './smsSegments'
import type { GatewayDeviceSummary } from './gatewayDevices'

export interface CampaignConfirmationReadiness {
  ready: boolean
  blockers: string[]
}

export function campaignConfirmationReadiness(input: {
  draftId: string | null
  smsUsage: CampaignSmsUsageEstimate
  device: GatewayDeviceSummary | null
}): CampaignConfirmationReadiness {
  const blockers: string[] = []
  if (!input.draftId) blockers.push('Save the message draft before confirming the campaign.')
  if (input.smsUsage.recipientCount <= 0) blockers.push('No recipients are available for confirmation.')
  if (input.smsUsage.blockedRecipients > 0) blockers.push('Resolve missing personalization values before confirming the campaign.')
  if (input.smsUsage.readyRecipients <= 0 || input.smsUsage.estimatedSmsUnits <= 0) blockers.push('SMS usage could not be calculated for the recipient list.')
  if (!input.device) blockers.push('Pair an Android phone before confirming the campaign.')
  else if (input.device.status !== 'active') blockers.push('The paired Android phone is not active.')
  else if (input.device.bindingStatus !== 'ready' || !input.device.boundSimId) blockers.push('Select a currently present SIM before confirming the campaign.')
  return { ready: blockers.length === 0, blockers }
}

export function campaignEncodingSummary(gsm7Recipients: number, unicodeRecipients: number, recipientCount: number): 'GSM-7' | 'Unicode' | 'Mixed' | '—' {
  if (recipientCount <= 0) return '—'
  if (gsm7Recipients === recipientCount) return 'GSM-7'
  if (unicodeRecipients === recipientCount) return 'Unicode'
  return 'Mixed'
}
