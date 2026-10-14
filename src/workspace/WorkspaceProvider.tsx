import { recoveryRpc } from '../lib/requestRecovery'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorDiagnosticCategory, errorDiagnosticContext, errorMessage } from '../lib/errors'
import { clearOfflineWorkspaceLocator, readOfflineWorkspaceLocator, writeOfflineWorkspaceLocator } from '../lib/offlineWorkspaceLocator'
import { supabase } from '../lib/supabase'

export interface PersonalWorkspace {
  id: string
  name: string
  slug: string
}

export type WorkspaceAuthority = 'server' | 'local' | null

interface WorkspaceContextValue {
  workspace: PersonalWorkspace | null
  authority: WorkspaceAuthority
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

interface PersonalWorkspaceRow {
  workspace_id: string
  name: string
  slug: string
}

interface WorkspaceState {
  owner: string | null
  workspace: PersonalWorkspace | null
  authority: WorkspaceAuthority
  loading: boolean
  error: string | null
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function cachedWorkspace(userId: string): PersonalWorkspace | null {
  const cached = readOfflineWorkspaceLocator(userId)
  return cached ? { id: cached.workspaceId, name: cached.name, slug: cached.slug } : null
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { user, revalidateSession } = useAuth()
  const userId = user?.id ?? null
  const [state, setState] = useState<WorkspaceState>({ owner: null, workspace: null, authority: null, loading: false, error: null })
  const generation = useRef(0)
  const inFlight = useRef<{ userId: string | null; task: Promise<void> } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const wakeCooldown = useRef(0)

  const executeRefresh = useCallback(async () => {
    const request = ++generation.current
    if (!userId) {
      setState({ owner: null, workspace: null, authority: null, loading: false, error: null })
      return
    }

    const cached = cachedWorkspace(userId)
    if (!supabase || !navigator.onLine) {
      setState({ owner: userId, workspace: cached, authority: cached ? 'local' : null, loading: false, error: null })
      return
    }

    setState((current) => {
      const sameOwner = current.owner === userId
      const workspace = sameOwner ? current.workspace : cached
      const authority = sameOwner ? current.authority : (cached ? 'local' : null)
      return { owner: userId, workspace, authority, loading: true, error: null }
    })

    try {
      // Verify the session before the provisioning RPC; never retry this mutation blindly.
      const valid = await revalidateSession()
      if (request !== generation.current) return
      if (!valid) {
        clearOfflineWorkspaceLocator(userId)
        setState({ owner: userId, workspace: null, authority: null, loading: false, error: 'Authentication required. Sign in again.' })
        return
      }
      controller.current = new AbortController()
      const { data, error: rpcError } = await recoveryRpc(supabase, 'get_my_personal_workspace', {}, controller.current.signal)
      if (rpcError) throw rpcError
      const row = (data as PersonalWorkspaceRow[] | null)?.[0]
      if (!row?.workspace_id) throw new Error('Your personal workspace could not be provisioned.')
      const workspace = { id: row.workspace_id, name: row.name, slug: row.slug }
      if (request === generation.current) {
        writeOfflineWorkspaceLocator(userId, { workspaceId: workspace.id, name: workspace.name, slug: workspace.slug })
        setState({ owner: userId, workspace, authority: 'server', loading: false, error: null })
      }
    } catch (reason) {
      if (request !== generation.current) return
      const category = errorDiagnosticCategory(errorDiagnosticContext(reason))
      const message = errorMessage(reason, 'Your BulkText account could not be prepared.')

      if (category === 'authentication' || category === 'permission') {
        clearOfflineWorkspaceLocator(userId)
        setState({ owner: userId, workspace: null, authority: null, loading: false, error: message })
        if (category === 'authentication') void revalidateSession()
        return
      }

      setState((current) => ({
        owner: userId,
        workspace: current.owner === userId && current.workspace ? current.workspace : cached,
        authority: current.owner === userId && current.workspace ? current.authority : (cached ? 'local' : null),
        loading: false,
        error: message,
      }))
    }
  }, [revalidateSession, userId])

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current?.userId === userId) return inFlight.current.task
    const task = executeRefresh()
    const entry = { userId, task }
    inFlight.current = entry
    void task.finally(() => {
      if (inFlight.current === entry) { inFlight.current = null; wakeCooldown.current = Date.now() + 15_000 }
    })
    return task
  }, [executeRefresh, userId])

  useEffect(() => {
    void refresh()
    return () => { generation.current += 1; controller.current?.abort(); inFlight.current = null; wakeCooldown.current = 0 }
  }, [refresh])

  useEffect(() => {
    if (!userId) return
    const refreshWhenActive = () => {
      if (navigator.onLine && Date.now() >= wakeCooldown.current) void refresh()
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && Date.now() >= wakeCooldown.current) void refresh()
    }
    window.addEventListener('online', refreshWhenActive)
    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('online', refreshWhenActive)
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh, userId])

  // Hide the previous account immediately, before the identity-change effect runs.
  const owned = state.owner === userId
  const workspace = owned ? state.workspace : null
  const authority = owned ? state.authority : null
  const loading = Boolean(userId) && (!owned || state.loading)
  const error = owned ? state.error : null
  const value = useMemo<WorkspaceContextValue>(() => ({ workspace, authority, loading, error, refresh }), [workspace, authority, loading, error, refresh])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
