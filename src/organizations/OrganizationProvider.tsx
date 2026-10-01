import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/errors'
import type { InviteableRole, OrganizationRole } from '../lib/rbac'
import { supabase } from '../lib/supabase'

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  role: OrganizationRole
}

interface InvitationResult {
  invitationId: string
  token: string
  expiresAt: string
}

interface OrganizationContextValue {
  organizations: OrganizationSummary[]
  currentOrganization: OrganizationSummary | null
  loading: boolean
  refresh: () => Promise<void>
  switchOrganization: (organizationId: string) => void
  createOrganization: (name: string) => Promise<string>
  createInvitation: (email: string, role: InviteableRole) => Promise<InvitationResult>
  acceptInvitation: (token: string) => Promise<string>
}

interface MyOrganizationRow {
  organization_id: string
  name: string
  slug: string
  role: OrganizationRole
  joined_at: string
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)
const storageKey = 'bulktext.currentOrganizationId'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export function OrganizationProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(storageKey))
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user || !supabase) {
      setOrganizations([])
      setCurrentId(null)
      localStorage.removeItem(storageKey)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('list_my_organizations')
      if (error) throw error

      const next = ((data ?? []) as MyOrganizationRow[]).map((row) => ({
        id: row.organization_id,
        name: row.name,
        slug: row.slug,
        role: row.role,
      }))

      setOrganizations(next)
      setCurrentId((previous) => {
        const validPrevious = previous && next.some((org) => org.id === previous) ? previous : null
        const selected = validPrevious ?? next[0]?.id ?? null
        if (selected) localStorage.setItem(storageKey, selected)
        else localStorage.removeItem(storageKey)
        return selected
      })
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh().catch((reason) => {
      console.error('BulkText organization refresh failed:', errorMessage(reason, 'Unknown organization refresh error.'))
    })
  }, [refresh])

  const currentOrganization = organizations.find((org) => org.id === currentId) ?? null

  const value = useMemo<OrganizationContextValue>(() => ({
    organizations,
    currentOrganization,
    loading,
    refresh,
    switchOrganization(organizationId) {
      if (!organizations.some((org) => org.id === organizationId)) return
      localStorage.setItem(storageKey, organizationId)
      setCurrentId(organizationId)
    },
    async createOrganization(name) {
      const normalizedName = name.trim()
      if (normalizedName.length < 2 || normalizedName.length > 100) {
        throw new Error('Organization name must be between 2 and 100 characters.')
      }

      const client = requireSupabase()
      const { data, error } = await client.rpc('create_organization', { p_name: normalizedName })
      if (error) throw error
      if (typeof data !== 'string' || !data) throw new Error('Organization creation returned an invalid identifier.')

      const organizationId = data
      localStorage.setItem(storageKey, organizationId)
      setCurrentId(organizationId)

      try {
        await refresh()
      } catch (reason) {
        throw new Error(
          `Workspace was created, but the organization list could not be refreshed. Reload before retrying. ${errorMessage(reason, 'Refresh failed.')}`,
        )
      }

      return organizationId
    },
    async createInvitation(email, role) {
      if (!currentOrganization) throw new Error('Select an organization first.')
      const client = requireSupabase()
      const { data, error } = await client.rpc('create_organization_invitation', {
        p_organization_id: currentOrganization.id,
        p_email: email.trim(),
        p_role: role,
      })
      if (error) throw error
      const row = (data as Array<{ invitation_id: string; invite_token: string; expires_at: string }> | null)?.[0]
      if (!row) throw new Error('Invitation could not be created.')
      return { invitationId: row.invitation_id, token: row.invite_token, expiresAt: row.expires_at }
    },
    async acceptInvitation(token) {
      const client = requireSupabase()
      const { data, error } = await client.rpc('accept_organization_invitation', { p_token: token })
      if (error) throw error
      if (typeof data !== 'string' || !data) throw new Error('Invitation acceptance returned an invalid organization identifier.')

      const organizationId = data
      localStorage.setItem(storageKey, organizationId)
      setCurrentId(organizationId)
      await refresh()
      return organizationId
    },
  }), [currentOrganization, loading, organizations, refresh])

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganizations(): OrganizationContextValue {
  const value = useContext(OrganizationContext)
  if (!value) throw new Error('useOrganizations must be used inside OrganizationProvider')
  return value
}
