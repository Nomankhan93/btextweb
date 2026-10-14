// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DevicesPage } from '../pages/DevicesPage'
import { GATEWAY_IDLE_POLL_MS } from '../lib/useGatewayLiveStatus'
const mocks = vi.hoisted(() => ({ workspace: { id: 'one' }, devices: vi.fn(), sessions: vi.fn(), create: vi.fn(), bind: vi.fn() }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: mocks.workspace }) }))
vi.mock('../components/PairingQr', () => ({ PairingQr: () => <span>QR</span> }))
vi.mock('../lib/gatewayDevices', () => ({
  listGatewayDevices: mocks.devices, listGatewayPairingSessions: mocks.sessions,
  createGatewayPairing: mocks.create, bindGatewaySim: mocks.bind,
  clearGatewaySimBinding: vi.fn(), revokeGatewayDevice: vi.fn(), revokeGatewayPairing: vi.fn(),
  gatewayHealthLabel: () => 'Recently seen', gatewayBindingLabel: (d: { boundSimId: string | null }) => d.boundSimId ? 'Ufone selected' : 'No SIM selected',
  gatewayWorkspaceReadiness: (devices: Array<{ status: string; healthStatus: string; bindingStatus: string; boundSimId: string | null }>) => {
    const active = devices.filter((device) => device.status === 'active')
    const ready = active.find((device) => device.healthStatus === 'recent' && device.bindingStatus === 'ready' && device.boundSimId)
    const device = ready ?? active[0] ?? null
    return { kind: ready ? 'ready' : !device ? 'no_phone' : device.bindingStatus === 'missing' ? 'sim_missing' : device.bindingStatus !== 'ready' ? 'select_sim' : 'phone_attention', ready: Boolean(ready), device, activeDeviceCount: active.length, readyDeviceCount: ready ? 1 : 0, attentionDeviceCount: active.filter((item) => item.healthStatus !== 'recent').length }
  },
}))
const sim = { simId: 'sim', subscriptionId: 1, slotIndex: 0, carrierName: 'Ufone', present: true }
const phone = { deviceId: 'device-one', displayName: 'Test phone', platform: 'android', status: 'active', healthStatus: 'recent', bindingStatus: 'unbound', sims: [], boundSimId: null, appVersionCode: null, batteryPercent: null }
const session = { pairingId: 'pair', status: 'pending', createdAt: null, expiresAt: '2099-01-01', claimedDeviceId: null }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }
async function settle() { await act(async () => {}) }
async function tick() { await act(async () => { await vi.advanceTimersByTimeAsync(GATEWAY_IDLE_POLL_MS) }) }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.workspace = { id: 'one' }
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  mocks.devices.mockResolvedValue([]); mocks.sessions.mockResolvedValue([]); mocks.bind.mockResolvedValue(undefined)
  mocks.create.mockResolvedValue({ pairingId: 'pair', pairingCode: 'ABCD1234EFGH', pairingUri: 'test', expiresAt: '2099-01-01' })
})
afterEach(() => { cleanup(); vi.useRealTimers() })
it('automatically shows a paired phone, then inventory, without manual refresh', async () => {
  render(<DevicesPage />); await settle()
  mocks.devices.mockResolvedValue([phone]); await tick()
  expect(screen.getAllByText('Test phone')[0]).toBeTruthy()
  mocks.devices.mockResolvedValue([{ ...phone, sims: [sim] }]); await tick()
  expect(screen.getByRole('button', { name: 'Use this SIM' })).toBeTruthy()
  expect(mocks.devices).toHaveBeenCalledTimes(3)
})
it('preserves a pending raw code across polling and clears it when claimed', async () => {
  render(<DevicesPage />); await settle()
  mocks.sessions.mockResolvedValue([session])
  fireEvent.click(screen.getByText('Generate pairing code')); await settle()
  expect(screen.getByLabelText('Pairing code')).toBeTruthy()
  await tick(); expect(screen.getByLabelText('Pairing code')).toBeTruthy()
  mocks.sessions.mockResolvedValue([{ ...session, status: 'claimed' }]); mocks.devices.mockResolvedValue([phone]); await tick()
  expect(screen.queryByLabelText('Pairing code')).toBeNull()
  expect(screen.getByText(/Phone paired\. SIM details/)).toBeTruthy()
})
it('keeps loaded cards on polling failure and recovers automatically', async () => {
  mocks.devices.mockResolvedValue([phone]); render(<DevicesPage />); await settle()
  mocks.devices.mockRejectedValueOnce(new TypeError('Failed to fetch')); await tick()
  expect(screen.getAllByText('Test phone')[0]).toBeTruthy(); expect(screen.getByRole('status').textContent).toContain('Could not refresh'); expect(screen.getByRole('heading', { name: 'Status unavailable' })).toBeTruthy()
  await tick(); expect(screen.queryByText(/Could not refresh status/)).toBeNull(); expect(screen.getAllByText('Test phone').length).toBeGreaterThan(0)
})
it('pauses in hidden tabs, resumes on visibility and focus, and recovers online', async () => {
  render(<DevicesPage />); await settle()
  Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); fireEvent(document, new Event('visibilitychange')); await tick()
  expect(mocks.devices).toHaveBeenCalledTimes(1)
  Object.defineProperty(document, 'visibilityState', { value: 'visible' }); fireEvent(document, new Event('visibilitychange')); await settle()
  fireEvent(window, new Event('focus')); await settle(); expect(mocks.devices).toHaveBeenCalledTimes(3)
  Object.defineProperty(navigator, 'onLine', { value: false }); fireEvent(window, new Event('offline')); await tick()
  expect(mocks.devices).toHaveBeenCalledTimes(3)
  Object.defineProperty(navigator, 'onLine', { value: true }); fireEvent(window, new Event('online')); await settle()
  expect(mocks.devices).toHaveBeenCalledTimes(4)
})
it('coalesces triggers during an in-flight refresh and removes timers on unmount', async () => {
  const pending = deferred<never[]>(); mocks.devices.mockReturnValueOnce(pending.promise)
  const view = render(<DevicesPage />); await settle()
  fireEvent(window, new Event('focus')); fireEvent(window, new Event('online')); await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(mocks.devices).toHaveBeenCalledTimes(1)
  await act(async () => pending.resolve([])); expect(mocks.devices).toHaveBeenCalledTimes(1)
  await tick(); expect(mocks.devices).toHaveBeenCalledTimes(2)
  view.unmount(); await tick(); fireEvent(window, new Event('focus')); expect(mocks.devices).toHaveBeenCalledTimes(2)
})
it('ignores an old workspace response and does not reset on same-id context refresh', async () => {
  const pending = deferred<unknown[]>(); mocks.devices.mockReturnValueOnce(pending.promise)
  const view = render(<DevicesPage />); await settle()
  mocks.workspace = { id: 'two' }; mocks.devices.mockResolvedValue([{ ...phone, displayName: 'New account phone' }]); view.rerender(<DevicesPage />); await settle()
  await act(async () => pending.resolve([phone])); expect(screen.queryByText('Test phone')).toBeNull()
  expect(screen.getAllByText('New account phone')[0]).toBeTruthy()
  const count = mocks.devices.mock.calls.length; mocks.workspace = { id: 'two' }; view.rerender(<DevicesPage />); await settle()
  expect(mocks.devices).toHaveBeenCalledTimes(count)
})
it('discards a pre-mutation poll and refreshes the authoritative SIM after binding', async () => {
  mocks.devices.mockResolvedValue([{ ...phone, sims: [sim] }]); render(<DevicesPage />); await settle()
  const stale = deferred<unknown[]>(); mocks.devices.mockReturnValueOnce(stale.promise); await tick()
  const mutation = deferred<void>(); mocks.bind.mockReturnValueOnce(mutation.promise)
  fireEvent.click(screen.getByText('Use this SIM')); await settle()
  fireEvent.click(screen.getByRole('button', { name: /Use Ufone · SIM 1/i })); await settle()
  await act(async () => stale.resolve([])); expect(screen.getAllByText('Test phone')[0]).toBeTruthy()
  mocks.devices.mockResolvedValue([{ ...phone, sims: [sim], boundSimId: 'sim', bindingStatus: 'ready', boundCarrierName: 'Ufone', boundSlotIndex: 0 }])
  await act(async () => mutation.resolve()); expect(screen.getByText('Selected')).toBeTruthy()
  expect(mocks.bind).toHaveBeenCalledWith('one', 'device-one', 'sim')
})
it('manual refresh remains available and never authorizes or sends messages', async () => {
  render(<DevicesPage />); await settle(); fireEvent.click(screen.getByRole('button', { name: 'Refresh Phone & SIM status' })); await settle()
  expect(mocks.devices).toHaveBeenCalledTimes(2); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled()
})
