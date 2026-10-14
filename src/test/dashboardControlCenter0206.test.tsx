// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'

const mocks = vi.hoisted(() => ({
  devices: vi.fn(),
  imports: vi.fn(),
  sources: vi.fn(),
  drafts: vi.fn(),
  campaigns: vi.fn(),
}))

vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: true }) }))
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user', user_metadata: { display_name: 'Noman' } } }),
}))
vi.mock('../workspace/WorkspaceProvider', () => ({
  useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' } }),
}))
vi.mock('../lib/gatewayDevices', () => ({
  listGatewayDevices: mocks.devices,
  gatewayWorkspaceReadiness: (devices: Array<{ status: string; healthStatus: string; bindingStatus: string; boundSimId: string | null }>) => {
    const active = devices.filter((item) => item.status === 'active')
    const ready = active.find((item) => item.healthStatus === 'recent' && item.bindingStatus === 'ready' && item.boundSimId)
    const selected = ready ?? active[0] ?? null
    return { kind: ready ? 'ready' : !selected ? 'no_phone' : selected.bindingStatus === 'missing' ? 'sim_missing' : selected.bindingStatus !== 'ready' ? 'select_sim' : 'phone_attention', ready: Boolean(ready), device: selected, activeDeviceCount: active.length, readyDeviceCount: ready ? 1 : 0, attentionDeviceCount: 0 }
  },
}))
vi.mock('../lib/importsApi', () => ({ listContactImports: mocks.imports }))
vi.mock('../lib/messageComposerApi', () => ({ listMessageComposerSources: mocks.sources, listMessageComposerDrafts: mocks.drafts }))
vi.mock('../lib/campaignConfirmationApi', () => ({ listCampaignConfirmations: mocks.campaigns }))

const device = {
  deviceId: 'phone1', displayName: 'My phone', manufacturer: 'vivo', model: 'V2109', platform: 'android', status: 'active',
  credentialVersion: 1, credentialExpiresAt: null, pairedAt: '2026-10-10T00:00:00Z', lastSeenAt: '2026-10-14T09:00:00Z', revokedAt: null,
  androidRelease: '15', sdkInt: 35, appVersion: '0.18.5', appVersionCode: 17, batteryPercent: 80, lastInventoryAt: '2026-10-14T09:00:00Z',
  healthStatus: 'recent', boundSimId: 'sim', boundSubscriptionId: 1, boundSlotIndex: 0, boundCarrierName: 'Ufone', bindingStatus: 'ready', sims: [],
}
const source = {
  eligibilitySnapshotId: 'snapshot', recipientPreviewId: 'preview', eligibilityRevision: 1, eligibilityPolicyVersion: 'v1', candidateRows: 9,
  eligibleRows: 9, sourceFilename: 'contacts.csv', previewRevision: 1, snapshotCreatedAt: '2026-10-14T08:00:00Z',
}
const draft = {
  draftId: 'draft', eligibilitySnapshotId: 'snapshot', title: 'Follow up', messageTemplate: 'Hello', syntaxVersion: 'v1', templateVariables: [], eligibleRows: 9,
  sourceFilename: 'contacts.csv', eligibilityRevision: 1, createdAt: '2026-10-14T08:10:00Z', updatedAt: '2026-10-14T08:10:00Z', createdBy: 'user', updatedBy: 'user',
}
const campaign = {
  campaignId: 'campaign-1', title: 'October Campaign', recipientCount: 127, estimatedSmsUnits: 127, encodingSummary: 'GSM-7', minimumSegments: 1, maximumSegments: 1,
  gatewayDeviceName: 'vivo V2109', simCarrierName: 'Ufone', simSlotIndex: 0, confirmedAt: '2026-10-14T09:30:00Z',
}

function App() {
  return <MemoryRouter><DashboardPage /></MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.devices.mockResolvedValue([device])
  mocks.imports.mockResolvedValue([{ importId: 'import' }])
  mocks.sources.mockResolvedValue([source])
  mocks.drafts.mockResolvedValue([draft, { ...draft, draftId: 'draft-2' }])
  mocks.campaigns.mockResolvedValue([campaign])
})
afterEach(() => cleanup())

it('renders one campaign CTA, one sending setup summary, compact preparation modules, and recent activity', async () => {
  render(<App />)
  await screen.findByText('Setup ready')
  expect(screen.getAllByRole('link', { name: /New campaign/i })).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Your active route' })).toBeTruthy()
  expect(screen.queryByText('Current identity')).toBeNull()
  expect(screen.getByText('Recently seen')).toBeTruthy()
  expect(screen.getByText('vivo V2109')).toBeTruthy()
  expect(screen.getByText('Ufone')).toBeTruthy()
  expect(screen.getAllByText('9 prepared')[0]).toBeTruthy()
  expect(screen.getAllByText('2 saved')[0]).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Recent campaigns' })).toBeTruthy()
  expect(screen.getByText('October Campaign')).toBeTruthy()
  expect(screen.getByText('127')).toBeTruthy()
})

it('keeps fulfilled dashboard modules usable when a sibling resource fails', async () => {
  mocks.campaigns.mockRejectedValueOnce(new Error('history temporarily unavailable'))
  render(<App />)
  await screen.findByText('Setup ready')
  expect(screen.getByText(/Some dashboard information could not be refreshed: recent campaigns/)).toBeTruthy()
  expect(screen.getByText('vivo V2109')).toBeTruthy()
  expect(screen.getAllByText('9 prepared')[0]).toBeTruthy()
  expect(screen.getAllByText('2 saved')[0]).toBeTruthy()
  expect(screen.getByText(/Recent campaign history could not be refreshed/)).toBeTruthy()
})

it('does not misreport a failed gateway request as an unpaired phone', async () => {
  mocks.devices.mockRejectedValueOnce(new Error('gateway temporarily unavailable'))
  render(<App />)
  await waitFor(() => expect(screen.getByText(/Some dashboard information could not be refreshed: Phone & SIM/)).toBeTruthy())
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
  expect(screen.queryByText('Not paired')).toBeNull()
  expect(screen.getByText('October Campaign')).toBeTruthy()
  expect(screen.getAllByText('9 prepared')[0]).toBeTruthy()
})
