import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ErrorState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { useOrganizations } from './OrganizationProvider'

type InvitePreview = {
  organization_name: string
  invited_email: string
  invited_role: string
  expires_at: string
}

export function InviteAcceptancePage() {
  const { token = '' } = useParams()
  const { user } = useAuth()
  const { acceptInvitation } = useOrganizations()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supabase || !token) {
      setError('Invitation is unavailable.')
      setLoading(false)
      return
    }
    void supabase.rpc('get_organization_invitation_preview', { p_token: token }).then(({ data, error: rpcError }) => {
      if (rpcError) setError(rpcError.message)
      else {
        const row = (data as InvitePreview[] | null)?.[0]
        if (!row) setError('Invitation is invalid, expired, or already used.')
        else setPreview(row)
      }
      setLoading(false)
    })
  }, [token])

  if (loading) return <LoadingState label="Loading invitation…" />
  if (error || !preview) return <ErrorState title="Invitation unavailable">{error ?? 'Invitation could not be loaded.'}</ErrorState>

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await acceptInvitation(token)
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason, 'Invitation could not be accepted.'))
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <p className="eyebrow">Organization invitation</p>
        <h1>Join {preview.organization_name}</h1>
        <dl className="definition-grid compact-grid">
          <div><dt>Invited email</dt><dd>{preview.invited_email}</dd></div>
          <div><dt>Role</dt><dd>{preview.invited_role.replace('_', ' ')}</dd></div>
          <div><dt>Expires</dt><dd>{new Date(preview.expires_at).toLocaleString()}</dd></div>
        </dl>
        {error ? <p className="form-error">{error}</p> : null}
        {!user ? (
          <Link className="primary-link" to={`/auth/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Sign in with the invited email</Link>
        ) : (
          <button className="primary-button" type="button" onClick={() => void accept()} disabled={busy}>{busy ? 'Joining…' : 'Accept invitation'}</button>
        )}
      </section>
    </main>
  )
}
