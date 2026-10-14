// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { writeOfflineWorkspaceLocator } from '../lib/offlineWorkspaceLocator'
import { WorkspaceProvider, useWorkspace } from '../workspace/WorkspaceProvider'
import { RequireWorkspace } from '../workspace/RequireWorkspace'

const mocks = vi.hoisted(() => ({ user: { id: 'offline-user' }, rpc: vi.fn(), revalidateSession: vi.fn(async () => true) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user, revalidateSession: mocks.revalidateSession }) }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => { const task = mocks.rpc(...args); return { abortSignal: () => task } } } }))
vi.mock('../pwa/PwaProvider', () => ({ usePwa: () => ({ online: false }) }))

function Probe() {
  const { workspace, authority } = useWorkspace()
  return <output>{`${workspace?.id ?? 'none'}|${authority ?? 'none'}`}</output>
}

function App() {
  return (
    <WorkspaceProvider>
      <MemoryRouter initialEntries={['/campaigns/new']}>
        <Routes>
          <Route element={<RequireWorkspace />}>
            <Route path="/campaigns/new" element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </WorkspaceProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  mocks.user = { id: 'offline-user' }
  mocks.rpc.mockReset().mockRejectedValue(new Error('offline'))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('reopens only the signed-in account workspace locator for local draft access while offline', async () => {
  writeOfflineWorkspaceLocator('offline-user', { workspaceId: 'workspace-a', name: 'Mine', slug: 'mine' })
  render(<App />)
  expect(await screen.findByText('workspace-a|local')).toBeTruthy()
})

it('does not expose another account locator to the current user', async () => {
  writeOfflineWorkspaceLocator('different-user', { workspaceId: 'workspace-secret', name: 'Other', slug: 'other' })
  render(<App />)
  expect(await screen.findByText(/Reconnect once to verify/)).toBeTruthy()
  expect(screen.queryByText(/workspace-secret/)).toBeNull()
})
