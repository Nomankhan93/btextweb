// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ActionDialog } from '../components/ActionDialog'

afterEach(() => cleanup())

it('focuses the safe cancel action, traps keyboard focus, and closes on Escape', () => {
  const cancel = vi.fn()
  const confirm = vi.fn()
  render(<ActionDialog open title="Start sending?" confirmLabel="Start sending" onCancel={cancel} onConfirm={confirm}><p>9 recipients</p></ActionDialog>)

  const dialog = screen.getByRole('dialog', { name: 'Start sending?' })
  const cancelButton = screen.getByRole('button', { name: 'Cancel' })
  const confirmButton = screen.getByRole('button', { name: 'Start sending' })
  expect(document.activeElement).toBe(cancelButton)

  confirmButton.focus()
  fireEvent.keyDown(window, { key: 'Tab' })
  expect(document.activeElement).toBe(cancelButton)

  fireEvent.keyDown(window, { key: 'Escape' })
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(dialog.getAttribute('aria-modal')).toBe('true')
})

it('does not dismiss a busy irreversible action with Escape', () => {
  const cancel = vi.fn()
  render(<ActionDialog open busy title="Start sending?" confirmLabel="Start sending" busyLabel="Starting…" onCancel={cancel} onConfirm={vi.fn()} />)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(cancel).not.toHaveBeenCalled()
  expect((screen.getByRole('button', { name: 'Starting…' }) as HTMLButtonElement).disabled).toBe(true)
})

it('preserves keyboard focus when the parent refreshes and restores the opener on close', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const view = render(<ActionDialog open title="Confirm" confirmLabel="Proceed" onCancel={() => {}} onConfirm={() => {}} />)
  const confirm = screen.getByRole('button', { name: 'Proceed' })
  confirm.focus()
  view.rerender(<ActionDialog open title="Confirm" confirmLabel="Proceed" onCancel={() => {}} onConfirm={() => {}} />)
  expect(document.activeElement).toBe(confirm)
  view.rerender(<ActionDialog open={false} title="Confirm" confirmLabel="Proceed" onCancel={() => {}} onConfirm={() => {}} />)
  expect(document.activeElement).toBe(opener)
  opener.remove()
})
