import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorState } from '../components/StateViews'
import { supabase } from '../lib/supabase'

export function SettingsPage() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className="page-stack">
      <section className="page-heading"><div><p className="eyebrow">Account</p><h1>Settings</h1><p>Manage the profile attached to your personal BulkText account.</p></div></section>
      {error ? <ErrorState title="Update failed">{error}</ErrorState> : null}
      {message ? <div className="notice success-notice">{message}</div> : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Profile</p><h2>Your account profile</h2></div></div>
        <form className="form-stack narrow-form" onSubmit={saveProfile}>
          <label>Email<input value={user?.email ?? ''} disabled aria-readonly="true" /><small>Your sign-in email is managed by your account authentication.</small></label>
          <label>Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </form>
      </section>
    </div>
  )
}
