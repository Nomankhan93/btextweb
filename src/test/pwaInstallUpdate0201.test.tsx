// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PwaExperiencePrompts } from '../components/PwaExperiencePrompts'
import { LandingPage } from '../pages/LandingPage'
import { PwaProvider, usePwa } from '../pwa/PwaProvider'
import { registerBulkTextServiceWorker } from '../pwa/registerServiceWorker'

vi.mock('../pwa/registerServiceWorker', () => ({
  registerBulkTextServiceWorker: vi.fn(),
}))

const registerMock = vi.mocked(registerBulkTextServiceWorker)
let onWaiting: ((worker: ServiceWorker) => void) | undefined
let checkForUpdate: () => Promise<void>

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

function setStandalone(value: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: value && query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }
  event.prompt = prompt
  event.userChoice = Promise.resolve({ outcome, platform: 'web' })
  return { event, prompt }
}

function InstallabilityProbe() {
  const { canInstall, installed } = usePwa()
  return <output data-testid="installability">{`${canInstall ? 'installable' : 'not-installable'}|${installed ? 'installed' : 'browser'}`}</output>
}

beforeEach(() => {
  window.localStorage.clear()
  setOnline(true)
  setStandalone(false)
  checkForUpdate = vi.fn(async (): Promise<void> => undefined)
  onWaiting = undefined
  registerMock.mockReset()
  registerMock.mockImplementation(async (options) => {
    onWaiting = options.onWaiting
    return {
      registration: {} as ServiceWorkerRegistration,
      checkForUpdate,
    }
  })
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  setOnline(true)
  vi.restoreAllMocks()
})

it('shows a branded install prompt only when installable and suppresses the automatic prompt after Not now', async () => {
  render(
    <PwaProvider>
      <InstallabilityProbe />
      <PwaExperiencePrompts />
    </PwaProvider>,
  )

  const { event } = installEvent()
  fireEvent(window, event)

  expect(await screen.findByRole('button', { name: 'Install App' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy()
  expect(screen.getByTestId('installability').textContent).toBe('installable|browser')

  fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull())
  expect(screen.getByTestId('installability').textContent).toBe('installable|browser')

  const storedUntil = Number(window.localStorage.getItem('bulktext:pwa-install-dismissed-until:v1'))
  expect(storedUntil).toBeGreaterThan(Date.now())

  cleanup()
  render(
    <PwaProvider>
      <PwaExperiencePrompts />
    </PwaProvider>,
  )
  fireEvent(window, installEvent().event)

  await waitFor(() => expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull())
})

it('keeps Install App available in the landing menu and hides it after installation is accepted', async () => {
  const { event, prompt } = installEvent('accepted')

  render(
    <PwaProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </PwaProvider>,
  )

  fireEvent(window, event)
  const navigation = screen.getByRole('navigation', { name: 'Public navigation' })
  await waitFor(() => expect(within(navigation).getByRole('button', { name: 'Install App' })).toBeTruthy())

  fireEvent.click(within(navigation).getByRole('button', { name: 'Install App' }))
  await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(within(navigation).queryByRole('button', { name: 'Install App' })).toBeNull())
})

it('never offers installation when already running in standalone mode', async () => {
  setStandalone(true)

  render(
    <PwaProvider>
      <InstallabilityProbe />
      <PwaExperiencePrompts />
    </PwaProvider>,
  )

  fireEvent(window, installEvent().event)

  await waitFor(() => expect(screen.getByTestId('installability').textContent).toBe('not-installable|installed'))
  expect(screen.queryByRole('button', { name: 'Install App' })).toBeNull()
})

it('downloads updates in the background, honors Later for the same worker, and activates only on Update now', async () => {
  render(
    <PwaProvider>
      <PwaExperiencePrompts />
    </PwaProvider>,
  )

  await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(checkForUpdate).toHaveBeenCalled())

  const firstPostMessage = vi.fn()
  const secondPostMessage = vi.fn()
  const firstWorker = { postMessage: firstPostMessage } as unknown as ServiceWorker
  const secondWorker = { postMessage: secondPostMessage } as unknown as ServiceWorker

  act(() => onWaiting?.(firstWorker))
  expect(await screen.findByRole('button', { name: 'Update now' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Later' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull())

  act(() => onWaiting?.(firstWorker))
  expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull()

  act(() => onWaiting?.(secondWorker))
  expect(await screen.findByRole('button', { name: 'Update now' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Update now' }))
  expect(secondPostMessage).toHaveBeenCalledTimes(1)
  expect(secondPostMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  expect(await screen.findByRole('button', { name: 'Updating…' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Later' }).hasAttribute('disabled')).toBe(true)
})

it('checks for an update after registration and again when connectivity returns', async () => {
  render(<PwaProvider><span>App</span></PwaProvider>)

  await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(1))

  setOnline(false)
  fireEvent(window, new Event('offline'))
  setOnline(true)
  fireEvent(window, new Event('online'))

  await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(2))
})
