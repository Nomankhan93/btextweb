import { Link, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email')
  return (
    <AuthLayout title="Verify your email" subtitle="Email verification protects access to your BulkText account and messaging data.">
      <div className="notice success-notice">
        Verification instructions were sent{email ? <> to <strong>{email}</strong></> : null}. In local development, open Mailpit on port 56324.
      </div>
      <Link className="primary-link" to="/auth/login">Continue to sign in</Link>
    </AuthLayout>
  )
}
