import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await sendPasswordReset(email)
      setSent(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Reset email could not be sent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We will send a Supabase Auth recovery link to your email." footer={<Link to="/auth/login">Back to sign in</Link>}>
      {sent ? <div className="notice success-notice">Check your inbox (or local Mailpit) for the recovery link.</div> : (
        <form className="form-stack" onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send recovery link'}</button>
        </form>
      )}
    </AuthLayout>
  )
}
