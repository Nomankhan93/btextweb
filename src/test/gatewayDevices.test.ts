import { describe, expect, it } from 'vitest'
import { gatewayBindingLabel, gatewayHealthLabel, gatewayWorkspaceReadiness, type GatewayDeviceSummary } from '../lib/gatewayDevices'

function device(overrides: Partial<GatewayDeviceSummary> = {}): GatewayDeviceSummary {
  return {
    deviceId: 'device-one', displayName: 'Phone', platform: 'android', status: 'active', credentialVersion: 1,
    credentialExpiresAt: null, pairedAt: '2026-10-14T00:00:00Z', lastSeenAt: '2026-10-14T00:00:00Z', revokedAt: null,
    manufacturer: null, model: null, androidRelease: null, sdkInt: null, appVersion: null, appVersionCode: null,
    batteryPercent: null, lastInventoryAt: null, healthStatus: 'recent', boundSimId: 'sim-one', boundSubscriptionId: 1,
    boundSlotIndex: 0, boundCarrierName: 'Ufone', bindingStatus: 'ready', sims: [], ...overrides,
  }
}

describe('gateway device helpers', () => {
  it('renders health and explicit SIM binding states', () => {
    expect(gatewayHealthLabel('recent')).toBe('Recently seen')
    expect(gatewayHealthLabel('never_seen')).toBe('Awaiting inventory')
    expect(gatewayBindingLabel({ bindingStatus: 'unbound', boundCarrierName: null, boundSlotIndex: null })).toBe('No SIM selected')
    expect(gatewayBindingLabel({ bindingStatus: 'ready', boundCarrierName: 'Jazz', boundSlotIndex: 1 })).toBe('Jazz · SIM 2')
    expect(gatewayBindingLabel({ bindingStatus: 'missing', boundCarrierName: 'Ufone', boundSlotIndex: 0 })).toBe('Ufone · SIM 1 · missing')
  })

  it('derives workspace readiness only from fresh active phones with a present selected SIM', () => {
    expect(gatewayWorkspaceReadiness([]).kind).toBe('no_phone')
    expect(gatewayWorkspaceReadiness([device({ boundSimId: null, bindingStatus: 'unbound' })]).kind).toBe('select_sim')
    expect(gatewayWorkspaceReadiness([device({ bindingStatus: 'missing' })]).kind).toBe('sim_missing')
    expect(gatewayWorkspaceReadiness([device({ healthStatus: 'stale' })]).kind).toBe('phone_attention')
    expect(gatewayWorkspaceReadiness([device()]).kind).toBe('ready')
    expect(gatewayWorkspaceReadiness([device()]).ready).toBe(true)
  })

  it('selects a truly ready route when another paired phone is stale', () => {
    const readiness = gatewayWorkspaceReadiness([
      device({ deviceId: 'stale', healthStatus: 'stale' }),
      device({ deviceId: 'ready' }),
    ])
    expect(readiness.ready).toBe(true)
    expect(readiness.device?.deviceId).toBe('ready')
    expect(readiness.attentionDeviceCount).toBe(1)
  })
})
