// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../auth/LoginPage'
import { SignupPage } from '../auth/SignupPage'

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

it('uses the same compact auth shell hierarchy for sign in and create account', () => {
  const login = render(<MemoryRouter><LoginPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  expect(screen.getByText('Sign in to your BulkText workspace.')).toBeTruthy()
  expect(login.container.querySelector('.auth-card-wrap')).toBeTruthy()
  expect(login.container.querySelector('.auth-mobile-brand')).toBeTruthy()
  login.unmount()

  const signup = render(<MemoryRouter><SignupPage /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy()
  expect(screen.getByText('Create your BulkText workspace and connect your Android gateway.')).toBeTruthy()
  expect(screen.getByLabelText('Name')).toBeTruthy()
  expect(signup.container.querySelector('.auth-card-wrap')).toBeTruthy()
  expect(signup.container.querySelector('.auth-mobile-brand')).toBeTruthy()
})

it('provides an accessible show and hide password control on sign in', () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>)
  const password = screen.getByLabelText('Password') as HTMLInputElement
  const show = screen.getByRole('button', { name: 'Show password' })

  expect(password.type).toBe('password')
  expect(show.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(show)

  expect(password.type).toBe('text')
  const hide = screen.getByRole('button', { name: 'Hide password' })
  expect(hide.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(hide)
  expect(password.type).toBe('password')
})

it('preserves signup password guidance while using the shared visibility control', () => {
  render(<MemoryRouter><SignupPage /></MemoryRouter>)
  const password = screen.getByLabelText('Password') as HTMLInputElement
  expect(password.getAttribute('aria-describedby')).toBe('signup-password-help')
  expect(document.getElementById('signup-password-help')?.textContent).toBe('At least 8 characters.')

  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(password.type).toBe('text')
})

it('keeps auth inputs and password visibility control disabled while sign in is pending', async () => {
  auth.signIn.mockImplementation(() => new Promise(() => undefined))
  const view = render(<MemoryRouter><LoginPage /></MemoryRouter>)

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Signing in…' }).hasAttribute('disabled')).toBe(true))
  expect((screen.getByLabelText('Email') as HTMLInputElement).disabled).toBe(true)
  expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Show password' }).hasAttribute('disabled')).toBe(true)
  expect(view.container.querySelector('.auth-button-spinner')).toBeTruthy()
})

it('keeps forgot-password and account-switch links secondary but reachable', () => {
  const login = render(<MemoryRouter><LoginPage /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/auth/forgot-password')
  expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/auth/signup')
  login.unmount()

  render(<MemoryRouter><SignupPage /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/auth/login')
})
