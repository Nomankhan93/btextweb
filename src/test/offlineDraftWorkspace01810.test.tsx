// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { parseCsvText } from '../lib/importFiles'
import { campaignDraftKey, readCampaignDraft, writeCampaignDraft } from '../lib/campaignDraftStorage'
import { SimpleCampaignPage } from '../pages/SimpleCampaignPage'

const mock = vi.hoisted(() => ({
  online: false,
  rows: vi.fn(),
  save: vi.fn(),
  user: { id: 'offline-user' },
}))

vi.mock('../pwa/PwaProvider', () => ({
  usePwa: () => ({
    online: mock.online,
    installed: false,
    canInstall: false,
    updateAvailable: false,
    install: vi.fn(),
    applyUpdate: vi.fn(),
    dismissUpdate: vi.fn(),
    checkForUpdate: vi.fn(),
  }),
}))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mock.user }) }))
vi.mock('../workspace/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { id: 'offline-workspace', name: 'Mine', slug: 'mine' }, authority: 'server', loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../lib/messageComposerApi', () => ({ getMessagePersonalizationSourceRows: mock.rows, saveMessageComposerDraft: mock.save }))

const parsed = parseCsvText('Name,Mobile\nAli,03001234567', { fileName: 'contacts.csv', fileSha256: 'b'.repeat(64) })
const personalizationRow = {
  eligibilityRowId: 1,
  previewRowId: 2,
  sourceRowNumber: 2,
  firstName: 'Ali',
  lastName: null,
  displayName: 'Ali',
  normalizedE164: '+923001234567',
  customFields: {},
}
const key = campaignDraftKey('offline-user', 'offline-workspace')

function App() {
  return <MemoryRouter initialEntries={['/campaigns/new']}><Routes>
    <Route path="/campaigns/new" element={<SimpleCampaignPage />} />
    <Route path="/campaigns" element={<div>Campaign list</div>} />
  </Routes></MemoryRouter>
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  mock.online = false
  mock.rows.mockResolvedValue([personalizationRow])
  mock.save.mockResolvedValue('server-draft')
  writeCampaignDraft(key, {
    campaignName: 'Recovered campaign',
    messageTemplate: 'Hello {{name}}',
    parsed,
    mapping: { phone: 'Mobile', displayName: 'Name', firstName: null, lastName: null },
    evidenceReference: 'Local import',
    prepared: { importId: 'import', previewId: 'preview', snapshotId: 'snapshot', includedRows: 1, eligibleRows: 1, suppressedRows: 0 },
    draftId: 'server-draft',
      personalizationRows: [personalizationRow],
  })
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('keeps a prepared message editable offline, blocks server review, then reconciles without losing edits after reconnect', async () => {
  const view = render(<App />)
  expect(await screen.findByText(/Offline draft mode/)).toBeTruthy()
  expect(mock.rows).not.toHaveBeenCalled()

  const message = screen.getByRole('textbox', { name: /^SMS message/ }) as HTMLTextAreaElement
  fireEvent.change(message, { target: { value: 'Edited offline for {{name}}' } })
  const review = screen.getByRole('button', { name: 'Review campaign' }) as HTMLButtonElement
  expect(review.disabled).toBe(true)
  await waitFor(() => expect(readCampaignDraft(key)?.messageTemplate).toBe('Edited offline for {{name}}'))

  mock.online = true
  view.rerender(<App />)
  await waitFor(() => expect(mock.rows).toHaveBeenCalledWith('offline-workspace', 'snapshot'))
  await waitFor(() => expect((screen.getByRole('button', { name: 'Review campaign' }) as HTMLButtonElement).disabled).toBe(false))
  expect((screen.getByRole('textbox', { name: /^SMS message/ }) as HTMLTextAreaElement).value).toBe('Edited offline for {{name}}')
  expect(screen.getByText(/Prepared recipients last refreshed from the server/)).toBeTruthy()
}, 10_000)


it('keeps local autosave enabled after React StrictMode effect replay', async () => {
  render(<StrictMode><App /></StrictMode>)
  fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  const name = screen.getByRole('textbox', { name: 'Campaign name' }) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'StrictMode edit survives' } })
  await waitFor(() => expect(readCampaignDraft(key)?.campaignName).toBe('StrictMode edit survives'))
})
