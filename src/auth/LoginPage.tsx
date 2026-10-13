import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { PasswordField } from './PasswordField'
import { useAuth } from './AuthProvider'
import { errorMessage } from '../lib/errors'
import { safeReturnTo } from './returnTo'

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true })
    } catch (reason) {
      setError(errorMessage(reason, 'Sign in failed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your BulkText workspace."
      footer={<>New to BulkText? <Link to="/auth/signup">Create an account</Link>.</>}
    >
      <form className="form-stack auth-form" onSubmit={submit} aria-busy={busy} aria-describedby={error ? 'login-form-error' : undefined}>
        <label className="auth-field">Email<input type="email" autoComplete="email" required value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} /></label>
        <PasswordField id="login-password" label="Password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p id="login-form-error" className="form-error" role="alert">{error}</p> : null}
        <button className="primary-button auth-primary-button" type="submit" disabled={busy}>
          {busy ? <><span className="auth-button-spinner" aria-hidden="true" />Signing in…</> : 'Sign in'}
        </button>
        <Link className="text-link auth-recovery-link" to="/auth/forgot-password">Forgot password?</Link>
      </form>
    </AuthLayout>
  )
}
