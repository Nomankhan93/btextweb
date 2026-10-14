// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SimpleCampaignPage } from '../pages/SimpleCampaignPage'
import { parseCsvText } from '../lib/importFiles'
import { campaignDraftKey, writeCampaignDraft, type CampaignLocalDraft } from '../lib/campaignDraftStorage'

const mock = vi.hoisted(() => ({
  parse: vi.fn(),
  imports: vi.fn(),
  validation: vi.fn(),
  preview: vi.fn(),
  consent: vi.fn(),
  snapshot: vi.fn(),
  snapshotRows: vi.fn(),
  rows: vi.fn(),
  save: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user' } }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' }, authority: 'server', loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: true }) }))
vi.mock('../lib/importFiles', async (original) => ({ ...await original<object>(), parseSpreadsheetFile: mock.parse }))
vi.mock('../lib/importsApi', () => ({ createContactImport: mock.imports }))
vi.mock('../lib/recipientPreviewApi', () => ({ listImportValidationRows: mock.validation, createRecipientPreview: mock.preview }))
vi.mock('../lib/consentSuppressionApi', () => ({ recordRecipientPreviewBulkConsent: mock.consent, createRecipientEligibilitySnapshot: mock.snapshot, getRecipientEligibilitySnapshotRows: mock.snapshotRows }))
vi.mock('../lib/messageComposerApi', () => ({ getMessagePersonalizationSourceRows: mock.rows, saveMessageComposerDraft: mock.save }))

const parsed = parseCsvText('Name,Mobile\nAli,03001234567', { fileName: 'contacts.csv', fileSha256: 'c'.repeat(64) })
const source = { eligibilityRowId: 1, previewRowId: 2, sourceRowNumber: 2, firstName: 'Ali', lastName: null, displayName: 'Ali', normalizedE164: '+923001234567', customFields: {} }
const key = campaignDraftKey('user', 'workspace')

function App() {
  return <MemoryRouter initialEntries={['/campaigns/new']}><Routes>
    <Route path="/campaigns/new" element={<SimpleCampaignPage />} />
    <Route path="/campaigns" element={<div>Campaign list</div>} />
    <Route path="/campaigns/review/:draftId" element={<div>Review route</div>} />
  </Routes></MemoryRouter>
}

function seed(overrides: Partial<CampaignLocalDraft> = {}) {
  writeCampaignDraft(key, {
    campaignName: 'October update',
    messageTemplate: 'Hello {{name}}',
    parsed,
    mapping: { phone: 'Mobile', displayName: 'Name', firstName: null, lastName: null },
    evidenceReference: '',
    prepared: null,
    personalizationRows: [],
    draftId: null,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mock.parse.mockResolvedValue(parsed)
  mock.imports.mockResolvedValue('import')
  mock.validation.mockResolvedValue([{ importRowId: 1, sourceRowNumber: 2, normalizedE164: source.normalizedE164, phoneValidationStatus: 'valid' }])
  mock.preview.mockResolvedValue('preview')
  mock.consent.mockResolvedValue({ newGrantEvents: 1 })
  mock.snapshot.mockResolvedValue('snapshot')
  mock.snapshotRows.mockResolvedValue([{ eligibilityState: 'eligible', suppressionState: 'clear' }])
  mock.rows.mockResolvedValue([source])
  mock.save.mockResolvedValue('saved')
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows exactly one editable wizard step at a time', async () => {
  render(<App />)
  const name = await screen.findByRole('textbox', { name: 'Campaign name' })
  expect(screen.queryByText('Upload recipients')).toBeNull()
  expect(screen.queryByRole('textbox', { name: /^SMS message/ })).toBeNull()

  fireEvent.change(name, { target: { value: 'October update' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to recipients' }))

  expect(await screen.findByText('Upload recipients')).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'Campaign name' })).toBeNull()
  expect(screen.queryByRole('textbox', { name: /^SMS message/ })).toBeNull()
})

it('compresses recipient preparation and keeps mapping/evidence collapsed by default', async () => {
  seed()
  render(<App />)
  expect(await screen.findByText('contacts.csv')).toBeTruthy()
  expect(screen.getAllByText(/1 rows/)[0]).toBeTruthy()
  expect(screen.getByText(/1 valid/)).toBeTruthy()
  expect(screen.getByText(/Phone column detected/)).toBeTruthy()
  const mapping = screen.getByText('Advanced column mapping').closest('details')
  const evidence = screen.getByText('Add consent reference (optional)').closest('details')
  expect(mapping?.hasAttribute('open')).toBe(false)
  expect(evidence?.hasAttribute('open')).toBe(false)
  expect(screen.queryByText(/B$/)).toBeNull()
})

it('moves to Message only after recipient preparation and can go back without re-running the import', async () => {
  seed()
  render(<App />)
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  expect(await screen.findByRole('textbox', { name: /^SMS message/ })).toBeTruthy()
  expect(mock.imports).toHaveBeenCalledTimes(1)

  await waitFor(() => expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(await screen.findByText('Upload recipients')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  expect(await screen.findByRole('textbox', { name: /^SMS message/ })).toBeTruthy()
  expect(mock.imports).toHaveBeenCalledTimes(1)
})

it('uses a branded draft-discard dialog instead of a native confirm', async () => {
  render(<App />)
  const nativeConfirm = vi.spyOn(window, 'confirm')
  fireEvent.click(await screen.findByRole('button', { name: 'Discard draft' }))
  const dialog = await screen.findByRole('dialog', { name: 'Discard this draft?' })
  expect(within(dialog).getByRole('button', { name: 'Keep draft' })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Discard draft' })).toBeTruthy()
  expect(nativeConfirm).not.toHaveBeenCalled()
})
