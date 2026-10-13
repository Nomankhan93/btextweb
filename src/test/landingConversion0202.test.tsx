// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { installMock } = vi.hoisted(() => ({ installMock: vi.fn(async (): Promise<void> => undefined) }))

vi.mock('../pwa/PwaProvider', () => ({
  usePwa: () => ({ canInstall: true, install: installMock }),
}))

import { LandingPage } from '../pages/LandingPage'

afterEach(() => {
  cleanup()
  installMock.mockClear()
  document.body.style.overflow = ''
  vi.restoreAllMocks()
})

function renderLanding() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>)
}

it('keeps the mobile-first value proposition compact and moves product proof ahead of explanatory sections', () => {
  renderLanding()

  expect(screen.getByRole('heading', { level: 1, name: 'Business SMS, sent from your own SIM.' })).toBeTruthy()
  expect(screen.getByText('Create campaigns on the web and send through your paired Android phone using the exact SIM you choose.')).toBeTruthy()
  expect(screen.getByLabelText('BulkText dashboard preview')).toBeTruthy()
  expect(screen.getByText('1,284')).toBeTruthy()
  expect(screen.getByText('1,271')).toBeTruthy()
  expect(screen.getByText('1,243')).toBeTruthy()
  expect(screen.getByText('SIM 1 · Online')).toBeTruthy()
  expect(screen.queryByText('See the sending workflow without digging through technical screens')).toBeNull()
})

it('preserves install access while giving the mobile navigation an Escape-close and focus-return boundary', async () => {
  renderLanding()


  const menuButton = screen.getByRole('button', { name: 'Open navigation' })
  menuButton.focus()
  fireEvent.click(menuButton)

  const nav = screen.getByRole('navigation', { name: 'Public navigation' })
  expect(within(nav).getByRole('button', { name: 'Install App' })).toBeTruthy()
  expect(document.body.style.overflow).toBe('hidden')

  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Open navigation' })).toBeTruthy()
  expect(document.activeElement).toBe(menuButton)
  expect(document.body.style.overflow).toBe('')

  fireEvent.click(menuButton)
  fireEvent.click(within(nav).getByRole('button', { name: 'Install App' }))
  expect(installMock).toHaveBeenCalledTimes(1)
})

it('uses explicit accordion state and limits the comparison to the three primary differentiators', () => {
  renderLanding()

  const question = screen.getByRole('button', { name: /Does BulkText require a third-party SMS gateway/i })
  expect(question.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(question)
  expect(question.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByText(/coordinates sending through your paired Android phone/)).toBeTruthy()

  expect(screen.getByRole('heading', { name: 'Infrastructure' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Gateway cost model' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Routing control' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Delivery model' })).toBeNull()
})
