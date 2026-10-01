import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

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
      navigate(result.emailConfirmationRequired ? `/auth/verify?email=${encodeURIComponent(email)}` : '/onboarding', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account creation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with a private organization workspace. Android device pairing arrives in patch 0.6."
      footer={<>Already have an account? <Link to="/auth/login">Sign in</Link>.</>}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>Your name<input autoComplete="name" required minLength={2} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <p className="field-help">Use at least 8 characters. Supabase Auth enforces the account session.</p>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthLayout>
  )
}
