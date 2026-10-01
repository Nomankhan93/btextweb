import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../lib/errors'
import { useOrganizations } from './OrganizationProvider'

export function OnboardingPage() {
  const { createOrganization, organizations, switchOrganization } = useOrganizations()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createOrganization(name)
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(errorMessage(reason, 'Organization could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-card">
        <p className="eyebrow">Organization setup</p>
        <h1>Create your BulkText workspace</h1>
        <p className="muted-copy">Each business is isolated by organization membership and Row Level Security. Device pairing is added in patch 0.6.</p>

        {organizations.length ? (
          <div className="existing-orgs">
            <h2>Existing organizations</h2>
            {organizations.map((org) => (
              <button key={org.id} className="secondary-button" type="button" onClick={() => { switchOrganization(org.id); navigate('/dashboard') }}>
                {org.name} · {org.role.replace('_', ' ')}
              </button>
            ))}
          </div>
        ) : null}

        <form className="form-stack" onSubmit={submit}>
          <label>Business / organization name<input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Example Trading Co." /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating workspace…' : 'Create workspace'}</button>
        </form>
      </section>
    </main>
  )
}
