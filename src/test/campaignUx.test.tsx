// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SimpleCampaignPage } from '../pages/SimpleCampaignPage'
import { CampaignConfirmationPage } from '../pages/CampaignConfirmationPage'
import { MessageComposerPage } from '../pages/MessageComposerPage'
import { parseCsvText } from '../lib/importFiles'
import { campaignDraftKey, readCampaignDraft, writeCampaignDraft, type CampaignLocalDraft } from '../lib/campaignDraftStorage'
const mock = vi.hoisted(() => ({
  parse: vi.fn(), imports: vi.fn(), validation: vi.fn(), preview: vi.fn(), consent: vi.fn(), snapshot: vi.fn(), snapshotRows: vi.fn(), rows: vi.fn(), save: vi.fn(), drafts: vi.fn(), devices: vi.fn(), confirm: vi.fn(), sources: vi.fn(), user: { id: 'user' },
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mock.user }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'workspace', name: 'Mine', slug: 'mine' }, authority: 'server', loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../lib/importFiles', async (original) => ({ ...await original<object>(), parseSpreadsheetFile: mock.parse }))
vi.mock('../lib/importsApi', () => ({ createContactImport: mock.imports }))
vi.mock('../lib/recipientPreviewApi', () => ({ listImportValidationRows: mock.validation, createRecipientPreview: mock.preview }))
vi.mock('../lib/consentSuppressionApi', () => ({ recordRecipientPreviewBulkConsent: mock.consent, createRecipientEligibilitySnapshot: mock.snapshot, getRecipientEligibilitySnapshotRows: mock.snapshotRows }))
vi.mock('../lib/messageComposerApi', () => ({ getMessagePersonalizationSourceRows: mock.rows, saveMessageComposerDraft: mock.save, listMessageComposerDrafts: mock.drafts, listMessageComposerSources: mock.sources, deleteMessageComposerDraft: vi.fn() }))
vi.mock('../lib/gatewayDevices', () => ({ listGatewayDevices: mock.devices }))
vi.mock('../lib/campaignConfirmationApi', () => ({ confirmCampaign: mock.confirm }))
const parsed = parseCsvText('Name,Mobile\nAli,03001234567', { fileName: 'contacts.csv', fileSha256: 'a'.repeat(64) })
const source = { eligibilityRowId: 1, previewRowId: 2, sourceRowNumber: 2, firstName: 'Ali', lastName: null, displayName: 'Ali', normalizedE164: '+923001234567', customFields: {} }
const saved = { draftId: 'saved', eligibilitySnapshotId: 'snapshot', title: 'Saved title', messageTemplate: ' Hello {{name}} ', syntaxVersion: 'v1', templateVariables: ['name'], eligibleRows: 1, sourceFilename: 'contacts.csv', eligibilityRevision: 1, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }
const device = { deviceId: 'phone1', displayName: 'My phone', manufacturer: 'Maker', model: 'Model', status: 'active', boundSimId: 'sim', bindingStatus: 'ready', boundSlotIndex: 0, boundCarrierName: 'Carrier', lastSeenAt: null }
const key = campaignDraftKey('user', 'workspace')
function Location() { return <span data-testid="location">{useLocation().pathname}</span> }
function App({ path = '/campaigns/new' }: { path?: string }) {
  return <MemoryRouter initialEntries={[path]}><Location /><Routes>
    <Route path="/campaigns/new" element={<SimpleCampaignPage />} />
    <Route path="/campaigns/review/:draftId" element={<CampaignConfirmationPage />} />
    <Route path="/composer" element={<MessageComposerPage />} />
    <Route path="/campaigns/:id" element={<div>Campaign detail</div>} />
    <Route path="/campaigns" element={<div>Campaign list</div>} />
  </Routes></MemoryRouter>
}
function seed(overrides: Partial<CampaignLocalDraft> = {}) {
  writeCampaignDraft(key, { campaignName: 'Draft title', messageTemplate: ' Hello {{name}} ', parsed, mapping: { phone: 'Mobile', displayName: 'Name', firstName: null, lastName: null }, evidenceReference: 'CRM', prepared: { importId: 'import', previewId: 'preview', snapshotId: 'snapshot', includedRows: 1, eligibleRows: 1, suppressedRows: 0 }, draftId: 'saved', ...overrides })
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mock.user = { id: 'user' }
  mock.parse.mockReset().mockResolvedValue(parsed)
  mock.imports.mockReset().mockResolvedValue('import')
  mock.validation.mockReset().mockResolvedValue([{ importRowId: 1, sourceRowNumber: 2, normalizedE164: source.normalizedE164, phoneValidationStatus: 'valid' }])
  mock.preview.mockReset().mockResolvedValue('preview'); mock.consent.mockReset().mockResolvedValue({ newGrantEvents: 1 })
  mock.snapshot.mockReset().mockResolvedValue('snapshot'); mock.snapshotRows.mockReset().mockResolvedValue([{ eligibilityState: 'eligible', suppressionState: 'clear' }])
  mock.rows.mockReset().mockResolvedValue([source]); mock.save.mockReset().mockResolvedValue('saved')
  mock.drafts.mockReset().mockResolvedValue([saved]); mock.devices.mockReset().mockResolvedValue([device])
  mock.sources.mockReset().mockResolvedValue([{ eligibilitySnapshotId: 'snapshot', sourceFilename: 'contacts.csv', eligibleRows: 1, snapshotCreatedAt: saved.createdAt }])
  mock.confirm.mockReset().mockResolvedValue('campaign')
  vi.spyOn(window, 'confirm').mockReturnValue(true); vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('preserves valid import on picker cancellation/failure and resets consent only on successful replacement', async () => {
  const view = render(<App />)
  fireEvent.change(await screen.findByRole('textbox', { name: 'Campaign name' }), { target: { value: 'Import test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to recipients' }))
  await waitFor(() => expect(view.container.querySelector('input[type=file]')).not.toBeNull())
  const input = view.container.querySelector('input[type=file]')!
  fireEvent.change(input, { target: { files: [new File([''], 'contacts.csv')] } })
  const consent = await screen.findByRole('checkbox')
  fireEvent.click(consent)
  const replacementInput = view.container.querySelector('input[type=file]')!
  fireEvent.change(replacementInput, { target: { files: [] } })
  expect((consent as HTMLInputElement).checked).toBe(true)
  mock.parse.mockRejectedValueOnce(new Error('bad file'))
  fireEvent.change(replacementInput, { target: { files: [new File([''], 'broken.csv')] } })
  await screen.findByText('bad file')
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  fireEvent.change(replacementInput, { target: { files: [new File([''], 'replacement.csv')] } })
  await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false))
  expect(mock.parse).toHaveBeenCalledTimes(3)
})
it('restores a tab draft on remount, re-fetches recipient rows, and reuses the saved ID with exact message whitespace', async () => {
  seed()
  const view = render(<App />)
  await waitFor(() => expect((screen.getByRole('button', { name: 'Review campaign' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Campaign name' }), { target: { value: 'Edited title' } })
  view.unmount(); render(<App />)
  await waitFor(() => expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect((screen.getByRole('textbox', { name: 'Campaign name' }) as HTMLInputElement).value).toBe('Edited title')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to recipients' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Review campaign' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Review campaign' }))
  await screen.findByRole('heading', { name: 'Review & confirm' }, { timeout: 5_000 })
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({ draftId: 'saved', title: 'Edited title', messageTemplate: ' Hello {{name}} ' }))
  expect(mock.rows.mock.calls.length).toBeGreaterThanOrEqual(3)
})
it('does not reveal another account’s tab draft', async () => {
  seed(); mock.user = { id: 'other' }; render(<App />)
  expect(((await screen.findByRole('textbox', { name: 'Campaign name' })) as HTMLInputElement).value).toBe('')
})
it('resumes an acknowledged preparation step after a later read fails without duplicating its import', async () => {
  seed({ prepared: null, draftId: null }); mock.validation.mockRejectedValueOnce(new Error('temporary read failure'))
  render(<App />)
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  await screen.findByText('temporary read failure')
  fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  await screen.findByRole('textbox', { name: /^SMS message/ })
  expect(mock.imports).toHaveBeenCalledTimes(1)
  expect(mock.preview).toHaveBeenCalledTimes(1)
})
it('does not continue preparation with further writes after the screen unmounts', async () => {
  seed({ prepared: null, draftId: null })
  let resolve!: (value: string) => void
  mock.imports.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const view = render(<App />)
  fireEvent.click(await screen.findByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Continue to message' }))
  view.unmount()
  await act(async () => { resolve('import') })
  expect(mock.validation).not.toHaveBeenCalled()
  expect(mock.preview).not.toHaveBeenCalled()
})
it('shows load failures with a working review retry', async () => {
  mock.rows.mockRejectedValueOnce(new Error('offline review'))
  render(<App path="/campaigns/review/saved" />)
  expect((await screen.findByRole('alert')).textContent).toBe('offline review')
  fireEvent.click(screen.getByRole('button', { name: 'Retry review' }))
  await screen.findByRole('heading', { name: 'Review & confirm' })
})
it('requires a phone choice when several are paired; confirms once and clears the matching tab draft', async () => {
  seed(); mock.devices.mockResolvedValue([device, { ...device, deviceId: 'phone2', displayName: 'Other phone' }])
  let resolve!: (value: string) => void
  mock.confirm.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  render(<App path="/campaigns/review/saved" />)
  const button = await screen.findByRole('button', { name: 'Confirm campaign' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: 'Sending phone' }), { target: { value: 'phone2' } })
  fireEvent.click(button)
  const dialog = await screen.findByRole('dialog', { name: 'Confirm campaign?' })
  expect(mock.confirm).not.toHaveBeenCalled()
  const confirmButton = within(dialog).getByRole('button', { name: 'Confirm campaign' })
  fireEvent.click(confirmButton); fireEvent.click(confirmButton)
  expect(mock.confirm).toHaveBeenCalledTimes(1)
  expect(mock.confirm).toHaveBeenCalledWith('workspace', 'saved', 'phone2')
  await act(async () => { resolve('campaign') })
  expect(screen.getByTestId('location').textContent).toBe('/campaigns/campaign')
  expect(readCampaignDraft(key)).toBeNull()
})
it('loads the requested composer draft and blocks review of unsaved edits', async () => {
  render(<App path="/composer?snapshot=snapshot&draft=saved" />)
  const title = await screen.findByRole('textbox', { name: 'Draft title' })
  expect((title as HTMLInputElement).value).toBe('Saved title')
  expect((screen.getByRole('textbox', { name: /^Message/ }) as HTMLTextAreaElement).value).toBe(' Hello {{name}} ')
  await screen.findByRole('link', { name: 'Review & confirm' })
  fireEvent.change(title, { target: { value: 'Not saved' } })
  expect(screen.queryByRole('link', { name: 'Review & confirm' })).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Unsaved changes')
})
it('keeps failed restored recipients retryable without losing draft identity', async () => {
  seed(); mock.rows.mockRejectedValueOnce(new Error('read temporarily offline'))
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry prepared recipients' }))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Review campaign' }) as HTMLButtonElement).disabled).toBe(false))
  expect(readCampaignDraft(key)?.draftId).toBe('saved')
})
it('blocks confirmation when personalization is missing', async () => {
  mock.rows.mockResolvedValue([{ ...source, displayName: null, firstName: null }])
  render(<App path="/campaigns/review/saved" />)
  const button = await screen.findByRole('button', { name: 'Confirm campaign' })
  expect((button as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(button)
  expect(mock.confirm).not.toHaveBeenCalled()
})
