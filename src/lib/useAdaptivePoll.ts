import { useEffect, useRef, useState } from 'react'
import { classifyFailure, retryDelay, withDeadline } from './requestRecovery'

export function useAdaptivePoll<T>(scope: string, paused: boolean, read: (signal: AbortSignal) => Promise<T>,
  commit: (value: T) => void, interval: (value: T) => number) {
  const [connectionState, setConnectionState] = useState<'unknown' | 'healthy' | 'degraded' | 'offline' | 'auth_required' | 'blocked'>('unknown')
  const [fetching, setFetching] = useState(false)
  const [finished, setFinished] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null)
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null)
  const callbacks = useRef({ read, commit, interval })
  callbacks.current = { read, commit, interval }
  const refreshRef = useRef<() => void>(() => {})
  // Preserve cooldown across mutation pause/resume; scope changes reset it.
  const policy = useRef({ scope, failures: 0, cooldown: 0, stopped: false })
  if (policy.current.scope !== scope) policy.current = { scope, failures: 0, cooldown: 0, stopped: false }
  useEffect(() => {
    let disposed = false
    let running = false
    let wakePending = false
    let controller: AbortController | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const state = policy.current
    const visible = () => document.visibilityState !== 'hidden'
    const clear = () => { clearTimeout(timer); timer = undefined }
    const schedule = (delay: number) => { clear(); if (!disposed && !paused && visible() && navigator.onLine) timer = setTimeout(() => void refresh(), delay) }
    const refresh = async (manual = false) => {
      if (disposed || paused || !visible()) return
      if (running) { wakePending = true; return }
      clear()
      if (!navigator.onLine) { setConnectionState('offline'); setSyncError('You are offline. Last loaded details are shown.'); setFinished(true); setNextRetryAt(null); return }
      if (state.stopped && !manual) return
      if (Date.now() < state.cooldown) { setNextRetryAt(state.cooldown); schedule(state.cooldown - Date.now()); return }
      state.stopped = false
      running = true
      wakePending = false
      controller = new AbortController()
      setFetching(true)
      setNextRetryAt(null)
      let delay: number | null = null
      try {
        const value = await withDeadline('live-status', signal => callbacks.current.read(signal), controller.signal)
        if (disposed) return
        callbacks.current.commit(value)
        state.failures = 0; state.cooldown = 0
        setConnectionState('healthy'); setSyncError(null); setLastSuccessAt(Date.now())
        delay = callbacks.current.interval(value)
      } catch (reason) {
        controller.abort() // Cancel sibling RPCs before a later cycle can start.
        if (disposed) return
        const failure = classifyFailure(reason)
        if (failure.kind === 'cancelled') return
        if (failure.retryable) {
          setConnectionState('degraded')
          state.failures += 1
          delay = Math.max(retryDelay(state.failures), failure.retryAfterMs)
          state.cooldown = Date.now() + delay
          setNextRetryAt(state.cooldown)
          setSyncError('Could not refresh status. Last loaded details are shown; automatic retry will follow.')
        } else {
          setConnectionState(failure.kind === 'authentication' ? 'auth_required' : 'blocked')
          state.stopped = true
          setSyncError(failure.kind === 'authentication' ? 'Your session needs verification. Sign in again if prompted.' : failure.message)
          if (failure.kind === 'authentication') window.dispatchEvent(new Event('bulktext:auth-required'))
        }
      } finally {
        running = false
        if (!disposed) { setFetching(false); setFinished(true); if (delay !== null) schedule(delay); else if (wakePending && !state.stopped) schedule(0) }
      }
    }
    const wake = () => { if (visible()) void refresh(); else { clear(); controller?.abort() } }
    const offline = () => { clear(); controller?.abort(); setConnectionState('offline'); setSyncError('You are offline. Last loaded details are shown.'); setNextRetryAt(null); setFinished(true) }
    refreshRef.current = () => { void refresh(true) }
    if (paused) setFetching(false)
    else void refresh()
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', wake)
    return () => {
      disposed = true; clear(); controller?.abort(); refreshRef.current = () => {}
      window.removeEventListener('focus', wake); window.removeEventListener('online', wake)
      window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', wake)
    }
  }, [scope, paused])
  return { connectionState, fetching, finished, syncError, lastSuccessAt, nextRetryAt, refresh: () => refreshRef.current() }
}
