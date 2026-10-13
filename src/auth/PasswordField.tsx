import { useState, type ChangeEvent } from 'react'

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  describedBy?: string
  disabled?: boolean
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  describedBy,
  disabled = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const toggleLabel = visible ? 'Hide password' : 'Show password'

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password-control">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          aria-describedby={describedBy}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
        <button
          className="auth-password-toggle"
          type="button"
          aria-label={toggleLabel}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {visible ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.9 4.3A10.4 10.4 0 0 1 12 4c5.5 0 9 5 9 5a16.8 16.8 0 0 1-3 3.5" />
                <path d="M6.6 6.6C4.3 8.1 3 10 3 10s3.5 5 9 5a9.8 9.8 0 0 0 3.4-.6" />
              </>
            ) : (
              <>
                <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
                <circle cx="12" cy="12" r="2.5" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  )
}
