// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../workspace/WorkspaceProvider'
import { RequireWorkspace } from '../workspace/RequireWorkspace'
const mocks = vi.hoisted(() => ({ user: { id: 'one' }, rpc: vi.fn(), revalidateSession: vi.fn(async () => true) }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user, revalidateSession: mocks.revalidateSession }) }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => { const task = mocks.rpc(...args); return { abortSignal: () => task } } } }))
function Form() {
  const [value, setValue] = useState('')
  const { workspace, refresh } = useWorkspace()
  return <><span>{workspace?.name}</span><input aria-label="Draft" value={value} onChange={(e) => setValue(e.target.value)} /><button onClick={() => void refresh()}>Refresh workspace</button></>
}
function App() { return <WorkspaceProvider><MemoryRouter><Routes><Route element={<RequireWorkspace />}><Route path="/" element={<Form />} /></Route></Routes></MemoryRouter></WorkspaceProvider> }
function result(id: string) { return { data: [{ workspace_id: id, name: `Workspace ${id}`, slug: id }], error: null } }
beforeEach(() => { localStorage.clear(); mocks.user = { id: 'one' }; mocks.revalidateSession.mockClear(); mocks.rpc.mockReset().mockResolvedValue(result('one')) })
afterEach(() => { cleanup(); localStorage.clear() })
it('preserves the mounted form across same-user auth object refresh and explicit refresh failure', async () => {
  const view = render(<App />)
  fireEvent.change(await screen.findByLabelText('Draft'), { target: { value: 'Unsaved campaign' } })
  mocks.user = { id: 'one' }
  view.rerender(<App />)
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsaved campaign')
  let reject!: (value: Error) => void
  mocks.rpc.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  fireEvent.click(screen.getByText('Refresh workspace'))
  await act(async () => {})
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsaved campaign')
  await act(async () => { reject(new Error('offline')) })
  expect(screen.getByRole('status').textContent).toContain('preserved')
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('Unsaved campaign')
})
it('hides the old account immediately and ignores its late refresh response', async () => {
  const view = render(<App />)
  fireEvent.change(await screen.findByLabelText('Draft'), { target: { value: 'private' } })
  let resolve!: (value: ReturnType<typeof result>) => void
  mocks.rpc.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  fireEvent.click(screen.getByText('Refresh workspace'))
  await act(async () => {})
  mocks.user = { id: 'two' }; mocks.rpc.mockResolvedValue(result('two'))
  view.rerender(<App />)
  expect(screen.queryByDisplayValue('private')).toBeNull()
  await screen.findByText('Workspace two')
  await act(async () => { resolve(result('one')) })
  await waitFor(() => expect(screen.queryByText('Workspace one')).toBeNull())
  expect((screen.getByLabelText('Draft') as HTMLInputElement).value).toBe('')
})

it('drops verified workspace authority immediately when server permission is revoked', async () => {
  render(<App />)
  expect(await screen.findByText('Workspace one')).toBeTruthy()
  expect(localStorage.length).toBeGreaterThan(0)

  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied', status: 403 } })
  fireEvent.click(screen.getByText('Refresh workspace'))
  await act(async () => {})

  expect(await screen.findByText('Account setup needs attention')).toBeTruthy()
  expect(screen.queryByText('Workspace one')).toBeNull()
  expect(localStorage.length).toBe(0)
})

it('coalesces workspace wake events while session validation is pending', async () => {
  let resolve!: (value: boolean) => void
  mocks.revalidateSession.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  render(<App />)
  fireEvent(window, new Event('focus')); fireEvent(window, new Event('online'))
  expect(mocks.revalidateSession).toHaveBeenCalledTimes(1)
  expect(mocks.rpc).not.toHaveBeenCalled()
  await act(async () => resolve(true))
  expect(await screen.findByText('Workspace one')).toBeTruthy()
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
})
it('does not call workspace provisioning after definitive auth rejection', async () => {
  mocks.revalidateSession.mockResolvedValueOnce(false)
  render(<App />)
  expect(await screen.findByText('Authentication required. Sign in again.')).toBeTruthy()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
