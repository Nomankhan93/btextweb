import { useEffect, useId, useRef, type ReactNode } from 'react'

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type ActionDialogProps = {
  open: boolean
  title: string
  eyebrow?: string
  description?: string
  children?: ReactNode
  confirmLabel: string
  busyLabel?: string
  cancelLabel?: string
  busy?: boolean
  tone?: 'primary' | 'danger'
  initialFocus?: 'cancel' | 'confirm'
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ActionDialog({
  open,
  title,
  eyebrow,
  description,
  children,
  confirmLabel,
  busyLabel = 'Working…',
  cancelLabel = 'Cancel',
  busy = false,
  tone = 'primary',
  initialFocus = 'cancel',
  onConfirm,
  onCancel,
}: ActionDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const latest = useRef({ busy, onCancel })
  latest.current = { busy, onCancel }
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const initial = initialFocus === 'confirm' ? confirmRef.current : cancelRef.current
    initial?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialog) return
      if (event.key === 'Escape') {
        if (!latest.current.busy) {
          event.preventDefault()
          latest.current.onCancel()
        }
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [initialFocus, open])

  if (!open) return null

  return (
    <div className="action-dialog-layer">
      <div className="action-dialog-backdrop" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="action-dialog-heading">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId} className="muted-copy">{description}</p> : null}
        </div>
        {children ? <div className="action-dialog-content">{children}</div> : null}
        <div className="action-dialog-actions">
          <button ref={cancelRef} className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={tone === 'danger' ? 'danger-button' : 'primary-button'} type="button" disabled={busy} onClick={() => void onConfirm()}>{busy ? busyLabel : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
