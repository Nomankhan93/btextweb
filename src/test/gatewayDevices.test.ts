import { describe, expect, it } from 'vitest'
import { canManageGatewayDevices, gatewayBindingLabel, gatewayHealthLabel } from '../lib/gatewayDevices'

describe('gateway device helpers', () => {
  it('keeps gateway management limited to owner/admin', () => {
    expect(canManageGatewayDevices('owner')).toBe(true)
    expect(canManageGatewayDevices('admin')).toBe(true)
    expect(canManageGatewayDevices('campaign_manager')).toBe(false)
    expect(canManageGatewayDevices('analyst')).toBe(false)
    expect(canManageGatewayDevices('billing')).toBe(false)
  })

  it('renders health and explicit SIM binding states', () => {
    expect(gatewayHealthLabel('recent')).toBe('Recently seen')
    expect(gatewayHealthLabel('never_seen')).toBe('Awaiting inventory')
    expect(gatewayBindingLabel({ bindingStatus: 'unbound', boundCarrierName: null, boundSlotIndex: null })).toBe('No SIM selected')
    expect(gatewayBindingLabel({ bindingStatus: 'ready', boundCarrierName: 'Jazz', boundSlotIndex: 1 })).toBe('Jazz · SIM 2')
    expect(gatewayBindingLabel({ bindingStatus: 'missing', boundCarrierName: 'Ufone', boundSlotIndex: 0 })).toBe('Ufone · SIM 1 · missing')
  })
})
