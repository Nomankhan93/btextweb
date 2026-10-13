// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthLayout } from '../auth/AuthLayout'
import { LandingPage } from '../pages/LandingPage'

afterEach(cleanup)

it('renders a product-led landing page with accurate CTAs and no unlaunched pricing/free-tier claims', () => {
  render(<MemoryRouter><LandingPage /></MemoryRouter>)

  expect(screen.getByRole('heading', { level: 1, name: 'Business SMS, sent from your own SIM.' })).toBeTruthy()
  expect(screen.getAllByText('Your SIM. Your Messages. Your Reach.').length).toBeGreaterThan(0)
  expect(screen.getAllByRole('link', { name: 'Get Started' }).some((link) => link.getAttribute('href') === '/auth/signup')).toBe(true)
  expect(screen.getByRole('link', { name: 'See How It Works' }).getAttribute('href')).toBe('#how-it-works')
  expect(screen.queryByText('Pricing')).toBeNull()
  expect(screen.queryByText('Start Free')).toBeNull()
  expect(screen.getAllByText('Live delivery status').length).toBeGreaterThan(0)
  expect(screen.getByText('Delivery & Recovery Tracking')).toBeTruthy()
  expect(screen.queryByText('Delivery & Retry Tracking')).toBeNull()
})

it('exposes responsive public navigation and factual product sections', () => {
  render(<MemoryRouter><LandingPage /></MemoryRouter>)

  const nav = screen.getByRole('navigation', { name: 'Public navigation' })
  expect(within(nav).getByRole('link', { name: 'Features' }).getAttribute('href')).toBe('#features')
  expect(within(nav).getByRole('link', { name: 'Why BulkText' }).getAttribute('href')).toBe('#why-bulktext')
  expect(within(nav).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/auth/login')

  const menu = screen.getByRole('button', { name: 'Open navigation' })
  fireEvent.click(menu)
  expect(screen.getByRole('button', { name: 'Close navigation' }).getAttribute('aria-expanded')).toBe('true')

  expect(screen.getByText('No third-party gateway fee')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Turn your Android phone into your SMS gateway' })).toBeTruthy()
  expect(screen.getByText(/Delivery evidence depends on device and network callbacks/)).toBeTruthy()
})

it('uses the final logo system on auth surfaces without duplicating the old BT placeholder', () => {
  render(
    <MemoryRouter>
      <AuthLayout title="Welcome back" subtitle="Sign in to your BulkText workspace.">
        <div>Form body</div>
      </AuthLayout>
    </MemoryRouter>,
  )

  const logo = screen.getByAltText('BulkText — Your SIM. Your Messages. Your Reach.')
  expect(logo.getAttribute('src')).toBe('/branding/bulktext-logo.png')
  expect(screen.getAllByRole('link', { name: 'BulkText home' }).length).toBeGreaterThan(0)
  expect(screen.queryByText('BT')).toBeNull()
})
