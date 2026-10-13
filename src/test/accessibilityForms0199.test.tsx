// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { SignupPage } from '../auth/SignupPage'
import { PhoneNumbersPage } from '../pages/PhoneNumbersPage'

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}))

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => auth,
}))

beforeEach(() => {
  auth.signIn.mockReset()
  auth.signUp.mockReset()
})

afterEach(cleanup)

it('announces sign-in failures and exposes the async form busy state', async () => {
  let rejectSignIn!: (reason?: unknown) => void
  auth.signIn.mockImplementation(() => new Promise((_resolve, reject) => { rejectSignIn = reject }))

  render(<MemoryRouter><LoginPage /></MemoryRouter>)
  const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')
  expect(form?.getAttribute('aria-busy')).toBe('false')

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => expect(form?.getAttribute('aria-busy')).toBe('true'))
  await act(async () => rejectSignIn(new Error('Incorrect email or password.')))

  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toContain('Incorrect email or password.')
  expect(form?.getAttribute('aria-describedby')).toBe('login-form-error')
  expect(form?.getAttribute('aria-busy')).toBe('false')
})

it('programmatically associates password guidance with the signup password field', () => {
  render(<MemoryRouter><SignupPage /></MemoryRouter>)
  const password = screen.getByLabelText('Password')
  const describedBy = password.getAttribute('aria-describedby')
  expect(describedBy).toBe('signup-password-help')
  expect(document.getElementById(describedBy ?? '')?.textContent).toContain('At least 8 characters')
})

it('associates phone-number guidance and exposes live validation status plus a table caption', () => {
  render(<PhoneNumbersPage />)
  const textarea = screen.getByLabelText('Raw phone numbers')
  expect(textarea.getAttribute('aria-describedby')).toBe('phone-number-rules')
  expect(document.getElementById('phone-number-rules')?.textContent).toContain('Pakistan')

  const status = screen.getByRole('status')
  expect(status.getAttribute('aria-live')).toBe('polite')

  const table = screen.getByRole('table', { name: 'Phone number normalization results' })
  expect(within(table).getByText('Standard number')).toBeTruthy()
})
