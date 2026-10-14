import { withDeadline } from '../lib/requestRecovery'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { clearCampaignDrafts } from '../lib/campaignDraftStorage'
import { errorDiagnosticCategory, errorDiagnosticContext } from '../lib/errors'
import { clearRecentDiagnosticEvents, reportDiagnostic } from '../lib/observability'
import { clearOfflineWorkspaceLocators } from '../lib/offlineWorkspaceLocator'
import { supabase } from '../lib/supabase'

interface SignUpInput {
  email: string
  password: string
  displayName: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  revalidating: boolean
  revalidateSession: () => Promise<boolean>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: SignUpInput) => Promise<{ emailConfirmationRequired: boolean }>
  signOut: () => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

async function clearAccountScopedState() {
  await clearCampaignDrafts()
  clearOfflineWorkspaceLocators()
  clearRecentDiagnosticEvents()
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [revalidating, setRevalidating] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  const generation = useRef(0)
  const lastValidation = useRef({ userId: '', at: 0 })
  const revalidationInFlight = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    let authEventReceived = false
    const request = ++generation.current

    void withDeadline('auth-session', () => supabase!.auth.getSession()).then(({ data, error }) => {
      if (error) throw error
      if (active && request === generation.current && !authEventReceived) {
        sessionRef.current = data.session
        setSession(data.session)
        setLoading(false)
      }
    }).catch((reason) => {
      if (active && request === generation.current && !authEventReceived) {
        reportDiagnostic(reason, { source: 'handled-error', severity: 'warning' })
        setLoading(false)
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      authEventReceived = true
      const eventGeneration = ++generation.current
      revalidationInFlight.current = null
      lastValidation.current = { userId: '', at: 0 }
      const previousUserId = sessionRef.current?.user.id ?? null
      const nextUserId = nextSession?.user.id ?? null
      const identityChanged = Boolean(previousUserId && nextUserId && previousUserId !== nextUserId)

      if (identityChanged) {
        sessionRef.current = null
        setSession(null)
        setLoading(true)
        void clearAccountScopedState().then(() => {
          if (!active || eventGeneration !== generation.current) return
          sessionRef.current = nextSession
          setSession(nextSession)
          setLoading(false)
        })
        return
      }

      if (event === 'SIGNED_OUT' || !nextSession) void clearAccountScopedState()
      sessionRef.current = nextSession
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      generation.current += 1
      subscription.subscription.unsubscribe()
    }
  }, [])

  const revalidateSession = useCallback((): Promise<boolean> => {
    if (revalidationInFlight.current) return revalidationInFlight.current
    const current = sessionRef.current
    if (!supabase || !current) return Promise.resolve(false)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(true)

    if (lastValidation.current.userId === current.user.id && Date.now() - lastValidation.current.at < 15_000) return Promise.resolve(true)
    const request = ++generation.current
    setRevalidating(true)
    const task = (async () => {
      try {
        const { data, error } = await withDeadline('auth-user', () => supabase!.auth.getUser())
        if (request !== generation.current) return Boolean(sessionRef.current)
        if (error || !data.user) {
          const reason = error ?? new Error('Auth session missing')
          const category = errorDiagnosticCategory(errorDiagnosticContext(reason))
          if (category === 'authentication' || category === 'permission') {
            await clearAccountScopedState()
            reportDiagnostic(reason, { source: 'handled-error', category: 'authentication', severity: 'warning' })
            if (request === generation.current) {
              sessionRef.current = null
              setSession(null)
            }
            return false
          }
          reportDiagnostic(reason, { source: 'handled-error', category: category === 'domain' ? 'unknown' : category, severity: 'warning' })
          return Boolean(sessionRef.current)
        }

        const activeSession = sessionRef.current
        if (activeSession && activeSession.user.id !== data.user.id) {
          await clearAccountScopedState()
          if (request === generation.current) {
            sessionRef.current = null
            setSession(null)
          }
          reportDiagnostic(new Error('Authenticated identity changed during session validation'), { source: 'handled-error', category: 'authentication', severity: 'warning' })
          return false
        }
        return true
      } catch (reason) {
        if (request === generation.current) reportDiagnostic(reason, { source: 'handled-error', severity: 'warning' })
        return Boolean(sessionRef.current)
      } finally {
        if (request === generation.current) lastValidation.current = { userId: current.user.id, at: Date.now() }
        setRevalidating(false)
      }
    })()

    revalidationInFlight.current = task
    void task.finally(() => {
      if (revalidationInFlight.current === task) revalidationInFlight.current = null
    })
    return task
  }, [])

  useEffect(() => {
    const revalidateWhenActive = () => { void revalidateSession() }
    const revalidateWhenVisible = () => {
      if (document.visibilityState === 'visible') void revalidateSession()
    }
    const authRequired = () => { lastValidation.current.at = 0; void revalidateSession() }
    window.addEventListener('bulktext:auth-required', authRequired)
    window.addEventListener('online', revalidateWhenActive)
    window.addEventListener('focus', revalidateWhenActive)
    document.addEventListener('visibilitychange', revalidateWhenVisible)
    return () => {
      window.removeEventListener('bulktext:auth-required', authRequired)
      window.removeEventListener('online', revalidateWhenActive)
      window.removeEventListener('focus', revalidateWhenActive)
      document.removeEventListener('visibilitychange', revalidateWhenVisible)
    }
  }, [revalidateSession])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    revalidating,
    revalidateSession,
    async signIn(email, password) {
      const client = requireSupabase()
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    },
    async signUp({ email, password, displayName }) {
      const client = requireSupabase()
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      return { emailConfirmationRequired: data.session === null }
    },
    async signOut() {
      const client = requireSupabase()
      generation.current += 1
      await clearAccountScopedState()
      const { error } = await client.auth.signOut()
      if (error) throw error
      sessionRef.current = null
      setSession(null)
    },
    async sendPasswordReset(email) {
      const client = requireSupabase()
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) throw error
    },
    async updatePassword(password) {
      const client = requireSupabase()
      const { error } = await client.auth.updateUser({ password })
      if (error) throw error
    },
  }), [loading, revalidateSession, revalidating, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
