// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CampaignDetailPage } from '../pages/CampaignDetailPage'

const mock = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  listRecipients: vi.fn(),
  deleteCampaign: vi.fn(),
  preflight: vi.fn(),
  latestAuthorization: vi.fn(),
  authorize: vi.fn(),
  revoke: vi.fn(),
  enqueue: vi.fn(),
  requestRecovery: vi.fn(),
  setDispatch: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' } }) }))
vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: true }) }))
vi.mock('../lib/campaignConfirmationApi', () => ({
  getCampaignConfirmation: mock.getCampaign,
  listCampaignConfirmationRecipients: mock.listRecipients,
  deleteCampaign: mock.deleteCampaign,
}))
vi.mock('../lib/gatewayPreflightApi', () => ({
  getCampaignSendPreflight: mock.preflight,
  getLatestCampaignSendAuthorization: mock.latestAuthorization,
  authorizeCampaignSend: mock.authorize,
  revokeCampaignSendAuthorization: mock.revoke,
}))
vi.mock('../lib/durableQueueApi', () => ({ enqueueCampaignDispatch: mock.enqueue }))
vi.mock('../lib/deliveryAttemptsApi', () => ({ requestCampaignMessageRecovery: mock.requestRecovery }))
vi.mock('../lib/useCampaignLiveStatus', () => ({
  useCampaignLiveStatus: () => ({
    dispatch: null,
    setDispatch: mock.setDispatch,
    deliveryStatus: null,
    contractHealth: null,
    attempts: [],
    syncError: null,
    lastSuccessAt: null,
    nextRetryAt: null,
    fetching: false,
    loaded: true,
    refresh: mock.refresh,
  }),
}))

const campaign = {
  campaignId: 'campaign',
  title: 'October Winter Sale',
  sourceDraftId: 'draft',
  sourceDraftUpdatedAt: '2026-10-14T00:00:00Z',
  sourceEligibilitySnapshotId: 'snapshot',
  messageTemplateSnapshot: 'Winter upto 70% on abc',
  templateSyntaxVersion: 'v1',
  eligibilityPolicyVersion: 'v1',
  smsSegmentModelVersion: 'v1',
  recipientCount: 9,
  estimatedSmsUnits: 9,
  gsm7Recipients: 9,
  unicodeRecipients: 0,
  minimumSegments: 1,
  maximumSegments: 1,
  averageSegments: 1,
  gatewayDeviceId: 'phone',
  gatewayDeviceName: 'vivo V2109',
  gatewayManufacturer: 'vivo',
  gatewayModel: 'V2109',
  gatewayLastSeenAt: '2026-10-14T00:00:00Z',
  gatewayLastInventoryAt: '2026-10-14T00:00:00Z',
  gatewaySimId: 'sim',
  simSubscriptionId: 1,
  simSlotIndex: 0,
  simCarrierName: 'Ufone',
  simDisplayName: 'Ufone',
  confirmedAt: '2026-10-14T00:00:00Z',
}

const readyPreflight = {
  ready: true,
  status: 'ready',
  blockerCodes: [],
  blockers: [],
  serverTime: '2026-10-14T00:00:00Z',
  campaignId: 'campaign',
  gatewayDeviceId: 'phone',
  gatewaySimId: 'sim',
  currentSubscriptionId: 1,
  currentSlotIndex: 0,
  currentSimIdentityHash: 'hash',
  deviceLastSeenAt: '2026-10-14T00:00:00Z',
  inventoryLastSeenAt: '2026-10-14T00:00:00Z',
  credentialExpiresAt: '2026-10-15T00:00:00Z',
  recipientCount: 9,
  currentEligibleRecipients: 9,
  blockedRecipients: 0,
}

const authorization = {
  authorizationId: 'auth',
  authorizedAt: '2026-10-14T00:00:00Z',
  expiresAt: '2099-10-14T00:05:00Z',
  revokedAt: null,
  revocationReason: null,
  status: 'authorized',
  gatewayDeviceId: 'phone',
  gatewaySimId: 'sim',
  simSubscriptionId: 1,
  simSlotIndex: 0,
}

const dispatch = {
  dispatchId: 'dispatch',
  authorizationId: 'auth',
  status: 'queued',
  enqueuedAt: '2026-10-14T00:00:00Z',
  gatewayDeviceId: 'phone',
  gatewaySimId: 'sim',
  simSubscriptionId: 1,
  simSlotIndex: 0,
  recipientCount: 9,
  estimatedSmsUnits: 9,
  queuedJobs: 9,
  leasedJobs: 0,
  downloadedJobs: 0,
}

function App() {
  return <MemoryRouter initialEntries={['/campaigns/campaign']}><Routes><Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} /><Route path="/campaigns" element={<div>Campaign list</div>} /></Routes></MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  mock.getCampaign.mockResolvedValue(campaign)
  mock.listRecipients.mockResolvedValue([])
  mock.preflight.mockResolvedValue(readyPreflight)
  mock.latestAuthorization.mockResolvedValue(null)
  mock.authorize.mockResolvedValue(authorization)
  mock.enqueue.mockResolvedValue(dispatch)
  mock.refresh.mockResolvedValue(undefined)
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('requires a branded final confirmation before the real send sequence and prevents duplicate submit', async () => {
  let resolveQueue!: (value: typeof dispatch) => void
  mock.enqueue.mockImplementationOnce(() => new Promise((resolve) => { resolveQueue = resolve }))
  render(<App />)

  const start = await screen.findByRole('button', { name: 'Start sending to 9 recipients' })
  expect(screen.queryByText('Subscription')).toBeNull()
  fireEvent.click(start)

  const dialog = await screen.findByRole('dialog', { name: 'Start sending?' })
  expect(mock.authorize).not.toHaveBeenCalled()
  expect(within(dialog).getByText('Sending begins immediately after the final safety check.')).toBeTruthy()

  const confirm = within(dialog).getByRole('button', { name: 'Start sending' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)

  await waitFor(() => expect(mock.authorize).toHaveBeenCalledTimes(1))
  expect(mock.enqueue).toHaveBeenCalledTimes(1)

  await act(async () => { resolveQueue(dispatch) })
  await waitFor(() => expect(mock.setDispatch).toHaveBeenCalledWith(dispatch))
})

it('stops safely when the final phone and SIM check fails', async () => {
  mock.preflight
    .mockResolvedValueOnce(readyPreflight)
    .mockResolvedValueOnce({ ...readyPreflight, ready: false, status: 'blocked', blockerCodes: ['device_stale'], blockers: ['Phone needs attention.'] })
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Start sending to 9 recipients' }))
  const dialog = await screen.findByRole('dialog', { name: 'Start sending?' })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Start sending' }))

  expect((await screen.findAllByText('Phone needs attention.')).length).toBeGreaterThan(0)
  expect(mock.authorize).not.toHaveBeenCalled()
  expect(mock.enqueue).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Start sending?' })).toBeNull()
})

it('requires the same consequential confirmation from the technical queue action', async () => {
  mock.latestAuthorization.mockResolvedValue(authorization)
  render(<App />)
  await screen.findByRole('button', { name: 'Start sending to 9 recipients' })
  fireEvent.click(screen.getByText('Technical send details'))
  fireEvent.click(screen.getByRole('button', { name: 'Review and start sending' }))
  const dialog = screen.getByRole('dialog', { name: 'Start sending?' })
  expect(mock.enqueue).not.toHaveBeenCalled()
  expect(within(dialog).getByText(/Sending begins immediately/)).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(mock.enqueue).not.toHaveBeenCalled()
})
