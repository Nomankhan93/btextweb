import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorState } from '../components/StateViews'
import { canManageOrganization } from '../lib/rbac'
import { supabase } from '../lib/supabase'
import { useOrganizations } from '../organizations/OrganizationProvider'

export function SettingsPage() {
  const { user } = useAuth()
  const { currentOrganization, refresh } = useOrganizations()
  const [displayName, setDisplayName] = useState('')
  const [organizationName, setOrganizationName] = useState(currentOrganization?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setOrganizationName(currentOrganization?.name ?? '')
  }, [currentOrganization?.id, currentOrganization?.name])

  useEffect(() => {
    if (!supabase || !user) return
    void supabase.from('profiles').select('display_name').eq('id', user.id).single().then(({ data }) => {
      if (data?.display_name) setDisplayName(data.display_name as string)
    })
  }, [user])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !user) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: updateError } = await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', user.id)
    if (updateError) setError(updateError.message)
    else setMessage('Profile updated.')
    setBusy(false)
  }

  async function saveOrganization(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !currentOrganization) return
    setBusy(true)
    setError(null)
    setMessage(null)
    const { error: updateError } = await supabase.from('organizations').update({ name: organizationName.trim() }).eq('id', currentOrganization.id)
    if (updateError) setError(updateError.message)
    else {
      await refresh()
      setMessage('Organization updated.')
    }
    setBusy(false)
  }

  return (
    <div className="page-stack">
      <section className="page-heading"><div><p className="eyebrow">Account</p><h1>Settings</h1><p>Profile and organization identity settings for the authenticated workspace.</p></div></section>
      {error ? <ErrorState title="Update failed">{error}</ErrorState> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Profile</p><h2>Your account profile</h2></div></div>
        <form className="form-stack narrow-form" onSubmit={saveProfile}>
          <label>Email<input value={user?.email ?? ''} disabled /></label>
          <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} /></label>
          <button className="primary-button" type="submit" disabled={busy}>Save profile</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Organization</p><h2>Workspace identity</h2></div></div>
        {currentOrganization && canManageOrganization(currentOrganization.role) ? (
          <form className="form-stack narrow-form" onSubmit={saveOrganization}>
            <label>Organization name<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} minLength={2} maxLength={100} required /></label>
            <label>Slug<input value={currentOrganization.slug} disabled /></label>
            <button className="primary-button" type="submit" disabled={busy}>Save organization</button>
          </form>
        ) : <p className="muted-copy">Only organization owners and admins can edit workspace identity.</p>}
      </section>
    </div>
  )
}
