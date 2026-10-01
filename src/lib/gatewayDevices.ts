import { errorMessage } from './errors'
import { supabase } from './supabase'

export type GatewayHealthStatus = 'recent' | 'stale' | 'offline' | 'never_seen' | 'revoked'
export type GatewayBindingStatus = 'ready' | 'missing' | 'unbound'

export interface GatewaySimSummary {
  simId: string
  subscriptionId: number
  slotIndex: number
  carrierName: string | null
  displayName: string | null
  countryIso: string | null
  isEmbedded: boolean
  present: boolean
  firstSeenAt: string
  lastSeenAt: string
}

export interface GatewayDeviceSummary {
  deviceId: string
  displayName: string
  platform: string
  status: 'active' | 'revoked'
  credentialVersion: number
  credentialExpiresAt: string | null
  pairedAt: string
  lastSeenAt: string | null
  revokedAt: string | null
  manufacturer: string | null
  model: string | null
  androidRelease: string | null
  sdkInt: number | null
  appVersion: string | null
  appVersionCode: number | null
  batteryPercent: number | null
  lastInventoryAt: string | null
  healthStatus: GatewayHealthStatus
  boundSimId: string | null
  boundSubscriptionId: number | null
  boundSlotIndex: number | null
  boundCarrierName: string | null
  bindingStatus: GatewayBindingStatus
  sims: GatewaySimSummary[]
}

export interface GatewayPairingSession {
  pairingId: string
  createdAt: string
  expiresAt: string
  claimedAt: string | null
  revokedAt: string | null
  claimedDeviceId: string | null
  status: 'pending' | 'claimed' | 'expired' | 'revoked'
}

export interface CreatedGatewayPairing {
  pairingId: string
  pairingCode: string
  pairingUri: string
  expiresAt: string
}

interface LegacyGatewayDeviceRow {
  device_id: string
  display_name: string
  platform: string
  status: 'active' | 'revoked'
  credential_version: number
  credential_expires_at: string | null
  paired_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

interface GatewayDeviceDashboardRow extends LegacyGatewayDeviceRow {
  manufacturer: string | null
  model: string | null
  android_release: string | null
  sdk_int: number | null
  app_version: string | null
  app_version_code: number | null
  battery_percent: number | null
  last_inventory_at: string | null
  health_status: GatewayHealthStatus
  bound_sim_id: string | null
  bound_subscription_id: number | null
  bound_slot_index: number | null
  bound_carrier_name: string | null
  binding_status: GatewayBindingStatus
  sims: unknown
}

interface GatewayPairingSessionRow {
  pairing_id: string
  created_at: string
  expires_at: string
  claimed_at: string | null
  revoked_at: string | null
  claimed_device_id: string | null
  status: 'pending' | 'claimed' | 'expired' | 'revoked'
}

interface CreatedGatewayPairingRow {
  pairing_id: string
  pairing_code: string
  pairing_uri: string
  expires_at: string
}

interface GatewaySimJson {
  simId?: unknown
  subscriptionId?: unknown
  slotIndex?: unknown
  carrierName?: unknown
  displayName?: unknown
  countryIso?: unknown
  isEmbedded?: unknown
  present?: unknown
  firstSeenAt?: unknown
  lastSeenAt?: unknown
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function unwrap<T>(data: T | null, error: unknown, fallback: string): T {
  if (error) throw new Error(errorMessage(error, fallback))
  if (data === null) throw new Error(fallback)
  return data
}

function nullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseSims(value: unknown): GatewaySimSummary[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as GatewaySimJson
    if (typeof row.simId !== 'string' || typeof row.subscriptionId !== 'number' || typeof row.slotIndex !== 'number') return []
    return [{
      simId: row.simId,
      subscriptionId: row.subscriptionId,
      slotIndex: row.slotIndex,
      carrierName: nullableString(row.carrierName),
      displayName: nullableString(row.displayName),
      countryIso: nullableString(row.countryIso),
      isEmbedded: row.isEmbedded === true,
      present: row.present === true,
      firstSeenAt: typeof row.firstSeenAt === 'string' ? row.firstSeenAt : '',
      lastSeenAt: typeof row.lastSeenAt === 'string' ? row.lastSeenAt : '',
    }]
  })
}

function mapDeviceRow(row: GatewayDeviceDashboardRow): GatewayDeviceSummary {
  return {
    deviceId: row.device_id,
    displayName: row.display_name,
    platform: row.platform,
    status: row.status,
    credentialVersion: row.credential_version,
    credentialExpiresAt: row.credential_expires_at,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    manufacturer: row.manufacturer,
    model: row.model,
    androidRelease: row.android_release,
    sdkInt: row.sdk_int,
    appVersion: row.app_version,
    appVersionCode: row.app_version_code,
    batteryPercent: row.battery_percent,
    lastInventoryAt: row.last_inventory_at,
    healthStatus: row.health_status,
    boundSimId: row.bound_sim_id,
    boundSubscriptionId: row.bound_subscription_id,
    boundSlotIndex: row.bound_slot_index,
    boundCarrierName: row.bound_carrier_name,
    bindingStatus: row.binding_status,
    sims: parseSims(row.sims),
  }
}

export function gatewayHealthLabel(status: GatewayHealthStatus) {
  switch (status) {
    case 'recent': return 'Recently seen'
    case 'stale': return 'Stale'
    case 'offline': return 'Offline'
    case 'never_seen': return 'Awaiting inventory'
    case 'revoked': return 'Revoked'
  }
}

export function gatewayBindingLabel(device: Pick<GatewayDeviceSummary, 'bindingStatus' | 'boundCarrierName' | 'boundSlotIndex'>) {
  if (device.bindingStatus === 'unbound') return 'No SIM selected'
  const carrier = device.boundCarrierName || 'SIM'
  const slot = device.boundSlotIndex === null ? '' : ` · SIM ${device.boundSlotIndex + 1}`
  return device.bindingStatus === 'missing' ? `${carrier}${slot} · missing` : `${carrier}${slot}`
}

export async function listGatewayDevices(organizationId: string): Promise<GatewayDeviceSummary[]> {
  const { data, error } = await client().rpc('list_gateway_device_dashboard', { p_organization_id: organizationId })
  const rows = unwrap((data ?? []) as GatewayDeviceDashboardRow[], error, 'Could not load gateway devices.')
  return rows.map(mapDeviceRow)
}

export async function listGatewayPairingSessions(organizationId: string): Promise<GatewayPairingSession[]> {
  const { data, error } = await client().rpc('list_gateway_pairing_sessions', { p_organization_id: organizationId })
  const rows = unwrap((data ?? []) as GatewayPairingSessionRow[], error, 'Could not load pairing sessions.')
  return rows.map((row) => ({
    pairingId: row.pairing_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
    revokedAt: row.revoked_at,
    claimedDeviceId: row.claimed_device_id,
    status: row.status,
  }))
}

export async function createGatewayPairing(organizationId: string): Promise<CreatedGatewayPairing> {
  const { data, error } = await client().rpc('create_gateway_pairing_code', { p_organization_id: organizationId })
  const rows = unwrap((data ?? []) as CreatedGatewayPairingRow[], error, 'Could not generate a gateway pairing code.')
  const row = rows[0]
  if (!row?.pairing_id || !row.pairing_code || !row.expires_at) throw new Error('Pairing response was incomplete.')
  return {
    pairingId: row.pairing_id,
    pairingCode: row.pairing_code,
    pairingUri: row.pairing_uri,
    expiresAt: row.expires_at,
  }
}

export async function revokeGatewayPairing(pairingId: string) {
  const { error } = await client().rpc('revoke_gateway_pairing_code', { p_pairing_id: pairingId })
  if (error) throw new Error(errorMessage(error, 'Could not revoke the pairing code.'))
}

export async function bindGatewaySim(organizationId: string, deviceId: string, simId: string) {
  const { error } = await client().rpc('bind_gateway_device_sim', {
    p_organization_id: organizationId,
    p_device_id: deviceId,
    p_sim_id: simId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not bind the selected SIM.'))
}

export async function clearGatewaySimBinding(organizationId: string, deviceId: string) {
  const { error } = await client().rpc('clear_gateway_device_sim_binding', {
    p_organization_id: organizationId,
    p_device_id: deviceId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not clear the SIM binding.'))
}

export async function revokeGatewayDevice(organizationId: string, deviceId: string) {
  const { error } = await client().rpc('revoke_gateway_device', {
    p_organization_id: organizationId,
    p_device_id: deviceId,
  })
  if (error) throw new Error(errorMessage(error, 'Could not revoke the gateway device.'))
}
