// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '../App'

const auth = vi.hoisted(() => ({
  value: {
    session: null as unknown,
    user: null as { id: string } | null,
    loading: false,
    signIn: vi.fn(async () => {}),
    signUp: vi.fn(async () => ({ emailConfirmationRequired: false })),
    signOut: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
    revalidating: false,
    revalidateSession: vi.fn(async () => true),
  },
}))

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => auth.value }))
vi.mock('../workspace/RequireWorkspace', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { RequireWorkspace: () => <Outlet /> }
})
vi.mock('../components/AppShell', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { AppShell: () => <Outlet /> }
})
vi.mock('../pages/DashboardPage', () => ({ DashboardPage: () => <h1>Dashboard route</h1> }))

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}{location.search}{location.hash}</span>
}

function renderRoute(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.value.user = null
  auth.value.session = null
  auth.value.loading = false
  auth.value.signIn.mockClear()
})

afterEach(cleanup)

it('renders the public landing page at root for signed-out visitors without redirecting to login', async () => {
  renderRoute('/')

  expect(await screen.findByRole('heading', { level: 1, name: 'Business SMS, sent from your own SIM.' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/')
  expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
})

it('redirects signed-in root visits to the protected dashboard', async () => {
  auth.value.user = { id: 'user-1' }
  renderRoute('/')

  expect(await screen.findByRole('heading', { name: 'Dashboard route' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/dashboard')
})

it('keeps protected-route returnTo behavior exact for signed-out visitors', async () => {
  renderRoute('/campaigns?status=active#queued')

  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/auth/login?returnTo=%2Fcampaigns%3Fstatus%3Dactive%23queued')
})

it('keeps direct login public and allows the landing Sign in CTA to reach it', async () => {
  const view = renderRoute('/')
  const signInLinks = await screen.findAllByRole('link', { name: 'Sign in' })
  fireEvent.click(signInLinks[0])
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/auth/login')

  view.unmount()
  renderRoute('/auth/login')
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  expect(screen.getByTestId('location').textContent).toBe('/auth/login')
})

it('does not honor an external or auth-loop return target after sign in', async () => {
  auth.value.user = { id: 'user-1' }
  renderRoute('/auth/login?returnTo=https%3A%2F%2Fexample.com%2Fsteal')
  const email = await screen.findByLabelText('Email')
  fireEvent.change(email, { target: { value: 'user@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => {
    expect(screen.getByTestId('location').textContent).toBe('/dashboard')
  })
})
