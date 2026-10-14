// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CampaignDetailPage } from '../pages/CampaignDetailPage'
import { processedDeliveryJobs, processingProgress } from '../lib/deliveryAttempts'

const mock = vi.hoisted(() => ({
  live: {} as Record<string, unknown>,
  refresh: vi.fn(),
  requestRecovery: vi.fn(),
}))

vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' } }) }))
vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: true }) }))
vi.mock('../lib/campaignConfirmationApi', () => ({
  getCampaignConfirmation: vi.fn().mockResolvedValue({
    campaignId: 'campaign', title: 'Delivery campaign', sourceDraftId: 'draft', sourceDraftUpdatedAt: '2026-10-14T00:00:00Z',
    sourceEligibilitySnapshotId: 'snapshot', messageTemplateSnapshot: 'Hello', templateSyntaxVersion: 'v1', eligibilityPolicyVersion: 'v1', smsSegmentModelVersion: 'v1',
    recipientCount: 9, estimatedSmsUnits: 9, gsm7Recipients: 9, unicodeRecipients: 0, minimumSegments: 1, maximumSegments: 1, averageSegments: 1,
    gatewayDeviceId: 'phone', gatewayDeviceName: 'vivo V2109', gatewayManufacturer: 'vivo', gatewayModel: 'V2109', gatewayLastSeenAt: '2026-10-14T00:00:00Z', gatewayLastInventoryAt: '2026-10-14T00:00:00Z',
    gatewaySimId: 'sim', simSubscriptionId: 1, simSlotIndex: 0, simCarrierName: 'Ufone', simDisplayName: 'Ufone', confirmedAt: '2026-10-14T00:00:00Z',
  }),
  listCampaignConfirmationRecipients: vi.fn().mockResolvedValue([]),
  deleteCampaign: vi.fn(),
}))
vi.mock('../lib/gatewayPreflightApi', () => ({
  getCampaignSendPreflight: vi.fn().mockResolvedValue({ ready: true, blockerCodes: [], blockers: [], currentEligibleRecipients: 9 }),
  getLatestCampaignSendAuthorization: vi.fn().mockResolvedValue(null), authorizeCampaignSend: vi.fn(), revokeCampaignSendAuthorization: vi.fn(),
}))
vi.mock('../lib/durableQueueApi', () => ({ enqueueCampaignDispatch: vi.fn() }))
vi.mock('../lib/deliveryAttemptsApi', () => ({ requestCampaignMessageRecovery: mock.requestRecovery }))
vi.mock('../lib/useCampaignLiveStatus', () => ({ useCampaignLiveStatus: () => mock.live }))

const dispatch = {
  dispatchId: 'dispatch', authorizationId: 'auth', status: 'downloaded', enqueuedAt: '2026-10-14T00:00:00Z', gatewayDeviceId: 'phone', gatewaySimId: 'sim',
  simSubscriptionId: 1, simSlotIndex: 0, recipientCount: 9, estimatedSmsUnits: 9, queuedJobs: 0, leasedJobs: 0, downloadedJobs: 9,
}

const activeStatus = {
  dispatchId: 'dispatch', recipientCount: 9, awaitingAttemptJobs: 2, preparedJobs: 1, submittedJobs: 1,
  sentJobs: 2, deliveredJobs: 3, failedJobs: 0, unknownJobs: 0, unresolvedUnknownJobs: 0,
  retryableFailedJobs: 0, recoveryRequestedJobs: 0, latestAttemptAt: '2026-10-14T00:01:00Z',
}

function setLive(deliveryStatus: Record<string, unknown> | null, attempts: Record<string, unknown>[] = []) {
  mock.live = {
    dispatch, setDispatch: vi.fn(), deliveryStatus, contractHealth: null, attempts,
    syncError: null, lastSuccessAt: Date.now(), nextRetryAt: null, fetching: false, loaded: true, refresh: mock.refresh,
  }
}

function App() {
  return <MemoryRouter initialEntries={['/campaigns/campaign']}><Routes><Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} /></Routes></MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.refresh.mockResolvedValue(undefined)
  mock.requestRecovery.mockResolvedValue(2)
  setLive(activeStatus)
})
afterEach(() => cleanup())

it('derives processed progress without counting unresolved UNKNOWN as complete', () => {
  const status = { ...activeStatus, awaitingAttemptJobs: 0, preparedJobs: 0, submittedJobs: 0, sentJobs: 2, deliveredJobs: 3, unknownJobs: 4, unresolvedUnknownJobs: 2 }
  expect(processedDeliveryJobs(status)).toBe(7)
  expect(processingProgress(status)).toBeCloseTo(77.777, 2)
})

it('shows authoritative live sending progress without folding SENT into DELIVERED', async () => {
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Sending in progress' })).toBeTruthy()
  expect(screen.getByText('5 of 9 processed')).toBeTruthy()
  expect(screen.getAllByText('5 / 9').length).toBeGreaterThan(0)
  expect(screen.getAllByText('3 / 9').length).toBeGreaterThan(0)
  expect(screen.getByText('Awaiting / active')).toBeTruthy()
})

it('surfaces UNKNOWN as attention and requires branded no-resend recovery confirmation', async () => {
  setLive({ ...activeStatus, awaitingAttemptJobs: 1, preparedJobs: 0, submittedJobs: 0, sentJobs: 2, deliveredJobs: 4, unknownJobs: 2, unresolvedUnknownJobs: 2 })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeTruthy()
  const action = screen.getByRole('button', { name: 'Continue without resending 2 UNKNOWN' })
  fireEvent.click(action)
  const dialog = await screen.findByRole('dialog', { name: 'Continue without resending UNKNOWN results?' })
  expect(within(dialog).getByText('Automatic resend')).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue without resending' }))
  await waitFor(() => expect(mock.requestRecovery).toHaveBeenCalledWith('workspace', 'campaign', 'skip_unknown'))
})

it('shows fully delivered only when every recipient reports DELIVERED', async () => {
  setLive({ ...activeStatus, awaitingAttemptJobs: 0, preparedJobs: 0, submittedJobs: 0, sentJobs: 0, deliveredJobs: 9 })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Delivery confirmed' })).toBeTruthy()
  expect(screen.getByText('All 9 recipients reported DELIVERED.')).toBeTruthy()
})

it('masks recipient numbers in diagnostic attempt history', async () => {
  setLive({ ...activeStatus, unknownJobs: 1, unresolvedUnknownJobs: 1 }, [{
    attemptId: 'attempt', jobId: 'job', sourceRowNumber: 1, normalizedE164: '+923347300609', attemptNumber: 1, state: 'unknown', safeRetryEligible: false,
    terminalReason: 'Outcome ambiguous.', submittedAt: null, sentAt: null, deliveredAt: null, failedAt: null, unknownAt: '2026-10-14T00:01:00Z', resolvedAt: null, resolution: null, createdAt: '2026-10-14T00:00:00Z',
  }])
  render(<App />)
  expect(await screen.findByText('+92••••••0609')).toBeTruthy()
  expect(screen.queryByText('+923347300609')).toBeNull()
})

it('keeps untouched queued recipients waiting for the phone even when a delivery aggregate exists', async () => {
  setLive({ ...activeStatus, awaitingAttemptJobs: 9, preparedJobs: 0, submittedJobs: 0, sentJobs: 0, deliveredJobs: 0 })
  mock.live.dispatch = { ...dispatch, status: 'queued', queuedJobs: 9, downloadedJobs: 0 }
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Waiting for phone' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Sending in progress' })).toBeNull()
})
