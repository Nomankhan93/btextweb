// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SimpleCampaignPage } from '../pages/SimpleCampaignPage'
import { CampaignConfirmationPage } from '../pages/CampaignConfirmationPage'
import { campaignDraftKey, writeCampaignDraft } from '../lib/campaignDraftStorage'
import { maskRecipientNumber } from '../lib/recipientDisplay'

const mock = vi.hoisted(() => ({
  rows: vi.fn(),
  drafts: vi.fn(),
  devices: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user' } }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' }, authority: 'server', loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: true }) }))
vi.mock('../lib/messageComposerApi', () => ({
  getMessagePersonalizationSourceRows: mock.rows,
  listMessageComposerDrafts: mock.drafts,
  saveMessageComposerDraft: vi.fn().mockResolvedValue('saved'),
}))
vi.mock('../lib/gatewayDevices', () => ({ listGatewayDevices: mock.devices }))
vi.mock('../lib/campaignConfirmationApi', () => ({ confirmCampaign: mock.confirm }))

const rows = Array.from({ length: 5 }, (_, index) => ({
  eligibilityRowId: index + 1,
  previewRowId: index + 10,
  sourceRowNumber: index + 2,
  displayName: ['Ali', 'Sara', 'Noman', 'Ayesha', 'Hina'][index],
  firstName: ['Ali', 'Sara', 'Noman', 'Ayesha', 'Hina'][index],
  lastName: null,
  normalizedE164: `+92300123456${index}`,
  customFields: { city: 'Karachi' },
}))

const prepared = {
  importId: 'import',
  previewId: 'preview',
  snapshotId: 'snapshot',
  includedRows: 5,
  candidateRows: 5,
  eligibleRows: 5,
  suppressedRows: 0,
  invalidRows: 0,
  duplicateRows: 0,
  consentGrantEvents: 5,
  sourceFilename: 'contacts.csv',
  preparedAt: '2026-10-14T00:00:00Z',
}

const draft = {
  draftId: 'saved', eligibilitySnapshotId: 'snapshot', title: 'October update', messageTemplate: 'Hello {{name}}', syntaxVersion: 'v1', templateVariables: ['name'], eligibleRows: 5, sourceFilename: 'contacts.csv', eligibilityRevision: 1, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z', createdBy: null, updatedBy: null,
}
const device = { deviceId: 'phone1', displayName: 'vivo V2109', manufacturer: 'vivo', model: 'V2109', status: 'active', boundSimId: 'sim', bindingStatus: 'ready', boundSlotIndex: 0, boundCarrierName: 'Ufone', lastSeenAt: '2026-10-14T00:00:00Z' }
const key = campaignDraftKey('user', 'workspace')

function App({ path = '/campaigns/new' }: { path?: string }) {
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/campaigns/new" element={<SimpleCampaignPage />} />
    <Route path="/campaigns/review/:draftId" element={<CampaignConfirmationPage />} />
    <Route path="/campaigns/:id" element={<div>Campaign detail</div>} />
    <Route path="/campaigns" element={<div>Campaigns</div>} />
  </Routes></MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mock.rows.mockResolvedValue(rows)
  mock.drafts.mockResolvedValue([draft])
  mock.devices.mockResolvedValue([device])
  mock.confirm.mockResolvedValue('campaign')
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows compact live composer metrics and inserts only safe personalization controls', async () => {
  writeCampaignDraft(key, {
    campaignName: 'October update',
    messageTemplate: 'Hello ',
    parsed: null,
    mapping: { phone: 'Mobile', displayName: 'Name', firstName: null, lastName: null },
    evidenceReference: '',
    prepared,
    personalizationRows: rows,
    draftId: 'saved',
  })
  render(<App />)
  const message = await screen.findByRole('textbox', { name: 'SMS message' })
  expect(screen.getByRole('button', { name: '+ Name' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '+ Phone' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '+ city' })).toBeTruthy()
  await waitFor(() => expect((screen.getByRole('button', { name: '+ Name' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '+ Name' }))
  expect((message as HTMLTextAreaElement).value).toContain('{{name}}')
  expect(document.body.textContent).toContain('characters')
  expect(document.body.textContent).toContain('GSM-7')
  expect(document.body.textContent).toContain('SMS')
})

it('does not offer a Name token when some prepared recipients do not have a safe name value', async () => {
  const incomplete = rows.map((row, index) => index === 1 ? { ...row, displayName: null, firstName: null } : row)
  writeCampaignDraft(key, {
    campaignName: 'October update', messageTemplate: 'Hello', parsed: null,
    mapping: { phone: 'Mobile', displayName: 'Name', firstName: null, lastName: null }, evidenceReference: '', prepared,
    personalizationRows: incomplete, draftId: 'saved',
  })
  render(<App />)
  await screen.findByRole('textbox', { name: 'SMS message' })
  expect(screen.queryByRole('button', { name: '+ Name' })).toBeNull()
  expect(screen.getByRole('button', { name: '+ Phone' })).toBeTruthy()
})

it('uses a compact review summary, masks recipient numbers, and limits the default recipient preview to three rows', async () => {
  render(<App path="/campaigns/review/saved" />)
  expect(await screen.findByRole('heading', { name: 'Review & confirm' })).toBeTruthy()
  expect(screen.getByLabelText('Campaign summary').textContent).toContain('5 recipients')
  expect(screen.getByLabelText('Campaign summary').textContent).toContain('~5 SMS')
  expect(screen.queryByText('Estimated SMS units')).toBeNull()
  expect(screen.queryByText(/server will render the template again/i)).toBeNull()
  expect(screen.queryByText(/Confirmation freezes this phone and SIM reference/i)).toBeNull()

  const panel = screen.getByRole('heading', { name: 'Recipient preview' }).closest('section')!
  const visibleRows = within(panel).getAllByText(/\+92•+\d{4}/)
  expect(visibleRows).toHaveLength(3)
  expect(panel.textContent).not.toContain(rows[0].normalizedE164)
  expect(within(panel).getByText('Preview first 5 recipients')).toBeTruthy()
})

it('masks numbers deterministically without exposing the middle digits', () => {
  expect(maskRecipientNumber('+923347300609')).toBe('+92••••••0609')
  expect(maskRecipientNumber('+923347300609')).not.toContain('347300')
})
