// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useCampaignLiveStatus, CAMPAIGN_POLL_MS } from '../lib/useCampaignLiveStatus'
const api = vi.hoisted(() => ({ queue: vi.fn(), status: vi.fn(), history: vi.fn(), health: vi.fn() }))
vi.mock('../lib/durableQueueApi', () => ({ getCampaignDispatch: api.queue }))
vi.mock('../lib/deliveryAttemptsApi', () => ({ getCampaignDeliveryStatus: api.status, listCampaignMessageAttempts: api.history, getCampaignContractHealth: api.health }))
function View({ id = 'one', paused = false }: { id?: string; paused?: boolean }) {
  const s = useCampaignLiveStatus('workspace', id, paused)
  return <><output>{s.dispatch?.queuedJobs ?? '-'} queued / {s.dispatch?.downloadedJobs ?? '-'} ACK / {s.deliveryStatus?.deliveredJobs ?? '-'} delivered</output><span>{s.syncError}</span><button onClick={s.refresh}>Refresh</button></>
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
async function settle() { await act(async () => {}) }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(CAMPAIGN_POLL_MS) }) }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  api.queue.mockResolvedValue({ queuedJobs: 9, downloadedJobs: 0 }); api.status.mockResolvedValue({ deliveredJobs: 0, sentJobs: 9 })
  api.history.mockResolvedValue([]); api.health.mockResolvedValue(null)
})
afterEach(() => { cleanup(); vi.useRealTimers() })
it('updates queued to ACKed to delivered without reload', async () => {
  render(<View />); await settle(); expect(screen.getByText('9 queued / 0 ACK / 0 delivered')).toBeTruthy()
  api.queue.mockResolvedValue({ queuedJobs: 0, downloadedJobs: 9 }); await tick()
  expect(screen.getByText('0 queued / 9 ACK / 0 delivered')).toBeTruthy()
  api.status.mockResolvedValue({ deliveredJobs: 9 }); await tick()
  expect(screen.getByText('0 queued / 9 ACK / 9 delivered')).toBeTruthy()
})
it('manual refresh updates the queue and callbacks together', async () => {
  render(<View />); await settle()
  api.queue.mockResolvedValue({ queuedJobs: 0, downloadedJobs: 9 }); api.status.mockResolvedValue({ deliveredJobs: 9 })
  fireEvent.click(screen.getByText('Refresh')); await settle()
  expect(screen.getByText('0 queued / 9 ACK / 9 delivered')).toBeTruthy()
})
it('keeps the last complete result if a member read fails and retries', async () => {
  render(<View />); await settle()
  api.status.mockResolvedValue({ deliveredJobs: 9 }); api.queue.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await tick(); expect(screen.getByText('9 queued / 0 ACK / 0 delivered')).toBeTruthy()
  expect(screen.getByText(/Could not refresh/)).toBeTruthy()
  api.queue.mockResolvedValue({ queuedJobs: 0, downloadedJobs: 9 }); await tick()
  expect(screen.getByText('0 queued / 9 ACK / 9 delivered')).toBeTruthy()
})
it('suspends hidden/offline polling and wakes on visibility, online and focus', async () => {
  render(<View />); await settle()
  Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); fireEvent(document, new Event('visibilitychange')); await tick()
  expect(api.queue).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { value: 'visible' }); fireEvent(document, new Event('visibilitychange')); await settle()
  expect(api.queue).toHaveBeenCalledTimes(2)
  Object.defineProperty(navigator, 'onLine', { value: false }); fireEvent(window, new Event('offline')); await tick()
  expect(api.queue).toHaveBeenCalledTimes(2)
  Object.defineProperty(navigator, 'onLine', { value: true }); fireEvent(window, new Event('online')); await settle()
  fireEvent(window, new Event('focus')); await settle(); expect(api.queue).toHaveBeenCalledTimes(4)
})
it('coalesces slow reads and cleans up after unmount', async () => {
  const pending = deferred<null>(); api.status.mockReturnValueOnce(pending.promise)
  const view = render(<View />); await settle()
  fireEvent(window, new Event('focus')); fireEvent(window, new Event('online')); await tick()
  expect(api.status).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve(null)); expect(api.status).toHaveBeenCalledTimes(1)
  await tick(); expect(api.status).toHaveBeenCalledTimes(2)
  view.unmount(); await tick(); fireEvent(window, new Event('focus')); expect(api.status).toHaveBeenCalledTimes(2)
})
it('discards a pending response across keyed campaign navigation', async () => {
  const pending = deferred<unknown>(); api.queue.mockReturnValueOnce(pending.promise)
  const view = render(<View key="one" />); await settle()
  api.queue.mockResolvedValue({ queuedJobs: 2, downloadedJobs: 0 }); view.rerender(<View key="two" id="two" />); await settle()
  await act(async () => pending.resolve({ queuedJobs: 9, downloadedJobs: 0 }))
  expect(screen.getByText('2 queued / 0 ACK / 0 delivered')).toBeTruthy()
})
it('discards pre-mutation reads and refreshes on resume', async () => {
  render(<View />).unmount()
  const pending = deferred<unknown>(); api.queue.mockReturnValueOnce(pending.promise)
  const view = render(<View />); await settle(); view.rerender(<View paused />); await settle()
  await act(async () => pending.resolve({ queuedJobs: 9, downloadedJobs: 0 }))
  expect(screen.getByText('- queued / - ACK / - delivered')).toBeTruthy()
  api.queue.mockResolvedValue({ queuedJobs: 0, downloadedJobs: 9 }); api.status.mockResolvedValue({ deliveredJobs: 9 })
  view.rerender(<View />); await settle(); expect(screen.getByText('0 queued / 9 ACK / 9 delivered')).toBeTruthy()
})
it('discovers a dispatch created in another tab after initially finding none', async () => {
  api.queue.mockResolvedValueOnce(null); api.status.mockResolvedValueOnce(null)
  render(<View />); await settle(); expect(screen.getByText('- queued / - ACK / - delivered')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) }); expect(screen.getByText('9 queued / 0 ACK / 0 delivered')).toBeTruthy()
})

vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace' } }) }))
vi.mock('../lib/campaignConfirmationApi', () => ({
  getCampaignConfirmation: vi.fn().mockResolvedValue({ title: 'Test campaign', recipientCount: 9, estimatedSmsUnits: 9, gsm7Recipients: 9, unicodeRecipients: 0, minimumSegments: 1, maximumSegments: 1, averageSegments: 1, simSlotIndex: 0, confirmedAt: null }),
  listCampaignConfirmationRecipients: vi.fn().mockResolvedValue([]), deleteCampaign: vi.fn(),
}))
vi.mock('../lib/gatewayPreflightApi', () => ({
  getCampaignSendPreflight: vi.fn().mockResolvedValue(null), getLatestCampaignSendAuthorization: vi.fn().mockResolvedValue(null),
  authorizeCampaignSend: vi.fn(), revokeCampaignSendAuthorization: vi.fn(),
}))
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CampaignDetailPage } from '../pages/CampaignDetailPage'
it('renders live queue progress on the actual campaign page without resetting its content', async () => {
  api.queue.mockResolvedValue({ status: 'queued', queuedJobs: 9, leasedJobs: 0, downloadedJobs: 0, recipientCount: 9, estimatedSmsUnits: 9, enqueuedAt: null, simSlotIndex: 0 })
  api.status.mockResolvedValue(null)
  render(<MemoryRouter initialEntries={['/campaigns/one']}><Routes><Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} /></Routes></MemoryRouter>)
  await settle()
  expect(screen.getByRole('heading', { name: 'Test campaign' })).toBeTruthy()
  expect(screen.getAllByText('0%')[0]).toBeTruthy()
  api.queue.mockResolvedValue({ status: 'downloaded', queuedJobs: 0, leasedJobs: 0, downloadedJobs: 9, recipientCount: 9, estimatedSmsUnits: 9, enqueuedAt: null, simSlotIndex: 0 })
  await tick()
  expect(screen.getByText('100%')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Refresh campaign status' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Test campaign' })).toBeTruthy()
})
