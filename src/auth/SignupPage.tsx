import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { useAuth } from './AuthProvider'
import { errorMessage } from '../lib/errors'

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await signUp({ email, password, displayName })
      navigate(result.emailConfirmationRequired ? `/auth/verify?email=${encodeURIComponent(email)}` : '/dashboard', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason, 'Account creation failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Create your BulkText workspace and connect your Android gateway."
      footer={<>Already have an account? <Link to="/auth/login">Sign in</Link>.</>}
    >
      <form className="form-stack auth-form" onSubmit={submit} aria-busy={busy}>
        <label className="auth-field">Name<input autoComplete="name" required minLength={2} value={displayName} disabled={busy} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label className="auth-field">Email<input type="email" autoComplete="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} /></label>
        <PasswordField id="signup-password" label="Password" autoComplete="new-password" minLength={8} describedBy="signup-password-help" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        <p id="signup-password-help" className="field-help auth-password-help">At least 8 characters.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button auth-primary-button" type="submit" disabled={busy}>
          {busy ? <><span className="auth-button-spinner" aria-hidden="true" />Creating account…</> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}
