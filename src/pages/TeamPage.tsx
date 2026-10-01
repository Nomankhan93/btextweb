import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ErrorState, LoadingState } from '../components/StateViews'
import { errorMessage } from '../lib/errors'
import { canManageOrganization, inviteableRoles, roleLabels, type InviteableRole, type OrganizationRole } from '../lib/rbac'
import { supabase } from '../lib/supabase'
import { useOrganizations } from '../organizations/OrganizationProvider'

interface MemberRow {
  user_id: string
  role: OrganizationRole
  joined_at: string
}

interface ProfileRow {
  id: string
  email: string
  display_name: string | null
}

interface InvitationRow {
  id: string
  email: string
  role: InviteableRole
  status: string
  expires_at: string
  created_at: string
}

interface MemberView extends MemberRow {
  email: string
  displayName: string
}

export function TeamPage() {
  const { currentOrganization, createInvitation } = useOrganizations()
  const [members, setMembers] = useState<MemberView[]>([])
  const [invitations, setInvitations] = useState<InvitationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteableRole>('campaign_manager')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canManage = canManageOrganization(currentOrganization?.role)

  async function loadTeam() {
    if (!supabase || !currentOrganization) return
    setLoading(true)
    setError(null)

    const [membersResult, invitationsResult] = await Promise.all([
      supabase.from('organization_members').select('user_id, role, joined_at').eq('organization_id', currentOrganization.id).order('joined_at'),
      canManage
        ? supabase.from('organization_invitations').select('id,email,role,status,expires_at,created_at').eq('organization_id', currentOrganization.id).eq('status', 'pending').order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])

    if (membersResult.error) {
      setError(membersResult.error.message)
      setLoading(false)
      return
    }
    if (invitationsResult.error) {
      setError(invitationsResult.error.message)
      setLoading(false)
      return
    }

    const memberRows = (membersResult.data ?? []) as MemberRow[]
    const ids = memberRows.map((member) => member.user_id)
    const profileResult = ids.length
      ? await supabase.from('profiles').select('id,email,display_name').in('id', ids)
      : { data: [], error: null }

    if (profileResult.error) {
      setError(profileResult.error.message)
      setLoading(false)
      return
    }

    const profiles = new Map(((profileResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]))
    setMembers(memberRows.map((member) => {
      const profile = profiles.get(member.user_id)
      return {
        ...member,
        email: profile?.email ?? member.user_id,
        displayName: profile?.display_name?.trim() || profile?.email || 'Member',
      }
    }))
    setInvitations((invitationsResult.data ?? []) as InvitationRow[])
    setLoading(false)
  }

  useEffect(() => {
    void loadTeam()
  }, [currentOrganization?.id])

  const ownerCount = useMemo(() => members.filter((member) => member.role === 'owner').length, [members])

  async function submitInvite(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setInviteLink(null)
    try {
      const result = await createInvitation(inviteEmail, inviteRole)
      setInviteLink(`${window.location.origin}/invite/${result.token}`)
      setInviteEmail('')
      await loadTeam()
    } catch (reason) {
      setError(errorMessage(reason, 'Invitation could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(userId: string, role: InviteableRole) {
    if (!supabase || !currentOrganization) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('set_organization_member_role', {
      p_organization_id: currentOrganization.id,
      p_user_id: userId,
      p_role: role,
    })
    if (rpcError) setError(rpcError.message)
    else await loadTeam()
    setBusy(false)
  }

  async function removeMember(userId: string) {
    if (!supabase || !currentOrganization) return
    if (!window.confirm('Remove this member from the organization?')) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('remove_organization_member', {
      p_organization_id: currentOrganization.id,
      p_user_id: userId,
    })
    if (rpcError) setError(rpcError.message)
    else await loadTeam()
    setBusy(false)
  }

  async function revokeInvitation(invitationId: string) {
    if (!supabase) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('revoke_organization_invitation', { p_invitation_id: invitationId })
    if (rpcError) setError(rpcError.message)
    else await loadTeam()
    setBusy(false)
  }

  if (!currentOrganization) return null
  if (loading) return <LoadingState label="Loading team…" />

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Organization access</p>
          <h1>Team & permissions</h1>
          <p>{currentOrganization.name} · Your role: {roleLabels[currentOrganization.role]}. Backend RPCs and RLS enforce membership boundaries.</p>
        </div>
      </section>

      {error ? <ErrorState title="Team action failed">{error}</ErrorState> : null}

      <section className="metric-grid" aria-label="Team status">
        <article className="metric-card"><span>Members</span><h2>{members.length}</h2><p>Active organization memberships.</p></article>
        <article className="metric-card"><span>Owners</span><h2>{ownerCount}</h2><p>Owner cannot be removed or demoted in this patch.</p></article>
        <article className="metric-card"><span>Pending invites</span><h2>{invitations.length}</h2><p>Invite links expire after seven days.</p></article>
      </section>

      {canManage ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Invite</p><h2>Add a team member</h2></div></div>
          <form className="inline-form" onSubmit={submitInvite}>
            <label>Email<input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@example.com" /></label>
            <label>Role<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InviteableRole)}>{inviteableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Working…' : 'Create invite'}</button>
          </form>
          <p className="field-help">0.5 creates a secure single-use invitation link. Automated invitation-email delivery is not part of this patch.</p>
          {inviteLink ? (
            <div className="invite-link-box">
              <code>{inviteLink}</code>
              <button className="secondary-button" type="button" onClick={() => void navigator.clipboard.writeText(inviteLink)}>Copy link</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Members</p><h2>Organization members</h2></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Member</th><th>Role</th><th>Joined</th>{canManage ? <th>Actions</th> : null}</tr></thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td><strong>{member.displayName}</strong><small>{member.email}</small></td>
                  <td>{member.role === 'owner' || !canManage ? roleLabels[member.role] : (
                    <select value={member.role} disabled={busy} onChange={(e) => void changeRole(member.user_id, e.target.value as InviteableRole)}>
                      {inviteableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </select>
                  )}</td>
                  <td>{new Date(member.joined_at).toLocaleDateString()}</td>
                  {canManage ? <td>{member.role === 'owner' ? 'Protected' : <button className="danger-button" type="button" disabled={busy} onClick={() => void removeMember(member.user_id)}>Remove</button>}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canManage && invitations.length ? (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Pending</p><h2>Invitations</h2></div></div>
          <div className="table-wrap">
            <table className="data-table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead><tbody>
              {invitations.map((invite) => <tr key={invite.id}><td>{invite.email}</td><td>{roleLabels[invite.role]}</td><td>{new Date(invite.expires_at).toLocaleString()}</td><td><button className="danger-button" type="button" disabled={busy} onClick={() => void revokeInvitation(invite.id)}>Revoke</button></td></tr>)}
            </tbody></table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
