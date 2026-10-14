// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevicesPage } from '../pages/DevicesPage'
import type { GatewayDeviceSummary, GatewaySimSummary } from '../lib/gatewayDevices'

const mocks = vi.hoisted(() => ({
  devices: vi.fn(), sessions: vi.fn(), create: vi.fn(), bind: vi.fn(), clear: vi.fn(), revoke: vi.fn(), revokePairing: vi.fn(),
}))

vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace-one' } }) }))
vi.mock('../components/PairingQr', () => ({ PairingQr: () => <span aria-label="QR code">QR</span> }))
vi.mock('../lib/gatewayDevices', async () => {
  const actual = await vi.importActual<typeof import('../lib/gatewayDevices')>('../lib/gatewayDevices')
  return {
    ...actual,
    listGatewayDevices: mocks.devices,
    listGatewayPairingSessions: mocks.sessions,
    createGatewayPairing: mocks.create,
    bindGatewaySim: mocks.bind,
    clearGatewaySimBinding: mocks.clear,
    revokeGatewayDevice: mocks.revoke,
    revokeGatewayPairing: mocks.revokePairing,
  }
})

const ufone: GatewaySimSummary = {
  simId: 'ufone', subscriptionId: 1, slotIndex: 0, carrierName: 'Ufone', displayName: null, countryIso: 'pk', isEmbedded: false,
  present: true, firstSeenAt: '2026-10-14T10:00:00Z', lastSeenAt: '2026-10-14T10:00:00Z',
}
const jazz: GatewaySimSummary = { ...ufone, simId: 'jazz', subscriptionId: 3, slotIndex: 1, carrierName: 'Jazz' }

function phone(overrides: Partial<GatewayDeviceSummary> = {}): GatewayDeviceSummary {
  return {
    deviceId: 'device-one', displayName: 'vivo V2109', platform: 'android', status: 'active', credentialVersion: 1,
    credentialExpiresAt: null, pairedAt: '2026-10-14T09:00:00Z', lastSeenAt: new Date().toISOString(), revokedAt: null,
    manufacturer: 'vivo', model: 'V2109', androidRelease: '13', sdkInt: 33, appVersion: '0.18.8-r1', appVersionCode: 23,
    batteryPercent: 80, lastInventoryAt: new Date().toISOString(), healthStatus: 'recent', boundSimId: 'ufone',
    boundSubscriptionId: 1, boundSlotIndex: 0, boundCarrierName: 'Ufone', bindingStatus: 'ready', sims: [ufone, jazz],
    ...overrides,
  }
}

async function settle() { await act(async () => {}) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  mocks.devices.mockResolvedValue([])
  mocks.sessions.mockResolvedValue([])
  mocks.create.mockResolvedValue({ pairingId: 'pair-one', pairingCode: 'ABCD1234EFGH', pairingUri: 'bulktext://pair/test', expiresAt: '2099-01-01T00:00:00Z' })
  mocks.bind.mockResolvedValue(undefined)
  mocks.clear.mockResolvedValue(undefined)
  mocks.revoke.mockResolvedValue(undefined)
  mocks.revokePairing.mockResolvedValue(undefined)
})

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('0.20.11 Phone & SIM readiness control center', () => {
  it('makes pairing the primary disconnected experience and keeps revoked phones historical', async () => {
    mocks.devices.mockResolvedValue([phone({ status: 'revoked', healthStatus: 'revoked', revokedAt: '2026-10-13T09:00:00Z' })])
    render(<DevicesPage />); await settle()
    expect(screen.getByRole('heading', { name: 'Phone not connected' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connect your Android phone' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Generate pairing code' })).toBeTruthy()
    expect(screen.getByText('Previous phones · 1')).toBeTruthy()
    expect(screen.queryByText('Connected Android phone')).toBeNull()
  })

  it('requires both a fresh gateway and a present selected SIM before showing Ready to send', async () => {
    mocks.devices.mockResolvedValue([phone()])
    render(<DevicesPage />); await settle()
    expect(screen.getByRole('heading', { name: 'Ready to send' })).toBeTruthy()
    expect(screen.getAllByText('Recently seen').length).toBeGreaterThan(0)
    expect(screen.getByText('Selected')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Generate pairing code' })).toBeNull()
    expect(screen.getByRole('button', { name: /Pair another phone/ })).toBeTruthy()
  })

  it('does not call a stale paired phone ready', async () => {
    mocks.devices.mockResolvedValue([phone({ healthStatus: 'stale', lastSeenAt: '2026-10-13T10:00:00Z' })])
    render(<DevicesPage />); await settle()
    expect(screen.getByRole('heading', { name: 'Phone needs attention' })).toBeTruthy()
    expect(screen.getAllByText('Not recently seen').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Ready to send' })).toBeNull()
  })

  it('prompts for a SIM when a paired phone has no selected SIM', async () => {
    mocks.devices.mockResolvedValue([phone({ boundSimId: null, boundSubscriptionId: null, boundSlotIndex: null, boundCarrierName: null, bindingStatus: 'unbound' })])
    render(<DevicesPage />); await settle()
    expect(screen.getByRole('heading', { name: 'Choose a SIM' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Use this SIM' })).toHaveLength(2)
  })

  it('uses a branded confirmation before switching the selected SIM', async () => {
    mocks.devices.mockResolvedValue([phone()])
    render(<DevicesPage />); await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Use this SIM' }))
    expect(screen.getByRole('dialog', { name: 'Change sending SIM?' })).toBeTruthy()
    expect(screen.getByText(/Confirmed campaigns keep their locked phone\/SIM snapshot/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Use Jazz · SIM 2/ }))
    await settle()
    expect(mocks.bind).toHaveBeenCalledWith('workspace-one', 'device-one', 'jazz')
  })

  it('keeps unselect and disconnect destructive actions behind branded confirmations', async () => {
    mocks.devices.mockResolvedValue([phone()])
    render(<DevicesPage />); await settle()
    fireEvent.click(screen.getByText('Device actions'))
    fireEvent.click(screen.getByRole('button', { name: 'Unselect SIM' }))
    expect(screen.getByRole('dialog', { name: /Unselect Ufone · SIM 1/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect phone' }))
    expect(screen.getByRole('dialog', { name: 'Disconnect vivo V2109?' })).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disconnect phone' }))
    await settle()
    expect(mocks.revoke).toHaveBeenCalledWith('workspace-one', 'device-one')
  })

  it('keeps technical device metadata and pairing URI out of the default path', async () => {
    mocks.devices.mockResolvedValue([phone()])
    render(<DevicesPage />); await settle()
    expect(screen.getByText('Credential').closest('details')?.open).toBe(false)
    fireEvent.click(screen.getByText('Device details'))
    expect(screen.getByText('Credential')).toBeTruthy()
    expect(screen.getByText('v1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Pair another phone/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing code' }))
    await settle()
    expect(screen.getByLabelText('Pairing code')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy pairing URI' }).closest('details')?.open).toBe(false)
    fireEvent.click(screen.getByText('More options'))
    expect(screen.getByRole('button', { name: 'Copy pairing URI' })).toBeTruthy()
  })
})
