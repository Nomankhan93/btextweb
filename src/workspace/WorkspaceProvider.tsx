import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

export interface PersonalWorkspace {
  id: string
  name: string
  slug: string
}

interface WorkspaceContextValue {
  workspace: PersonalWorkspace | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

interface PersonalWorkspaceRow {
  workspace_id: string
  name: string
  slug: string
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth()
  const [workspace, setWorkspace] = useState<PersonalWorkspace | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user || !supabase) {
      setWorkspace(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_personal_workspace')
      if (rpcError) throw rpcError
      const row = (data as PersonalWorkspaceRow[] | null)?.[0]
      if (!row?.workspace_id) throw new Error('Your personal workspace could not be provisioned.')
      setWorkspace({ id: row.workspace_id, name: row.name, slug: row.slug })
    } catch (reason) {
      setWorkspace(null)
      const message = errorMessage(reason, 'Your BulkText account could not be prepared.')
      setError(message)
      throw reason
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh().catch((reason) => {
      console.error('BulkText personal workspace refresh failed:', errorMessage(reason, 'Unknown workspace error.'))
    })
  }, [refresh])

  const value = useMemo<WorkspaceContextValue>(() => ({ workspace, loading, error, refresh }), [workspace, loading, error, refresh])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
