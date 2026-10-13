import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { registerBulkTextServiceWorker, type BulkTextServiceWorkerHandle } from './registerServiceWorker'

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PwaContextValue {
  online: boolean
  installed: boolean
  canInstall: boolean
  installPromptVisible: boolean
  updateAvailable: boolean
  install: () => Promise<InstallOutcome>
  dismissInstallPrompt: () => void
  applyUpdate: () => void
  dismissUpdate: () => void
  checkForUpdate: () => Promise<void>
}

const INSTALL_DISMISS_KEY = 'bulktext:pwa-install-dismissed-until:v1'
const INSTALL_DISMISS_MS = 3 * 24 * 60 * 60 * 1000
const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000

function isStandalone() {
  if (typeof window === 'undefined') return false
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || navigatorWithStandalone.standalone === true
}

function installPromptIsSuppressed() {
  if (typeof window === 'undefined') return false
  try {
    const until = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY) ?? 0)
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
  }
}

function storeInstallDismissal() {
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + INSTALL_DISMISS_MS))
  } catch {
    // Install prompting is best-effort and must never block the web app.
  }
}

function clearInstallDismissal() {
  try {
    window.localStorage.removeItem(INSTALL_DISMISS_KEY)
  } catch {
    // Install prompting is best-effort and must never block the web app.
  }
}

const fallbackValue: PwaContextValue = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  installed: isStandalone(),
  canInstall: false,
  installPromptVisible: false,
  updateAvailable: false,
  install: async () => 'unavailable',
  dismissInstallPrompt: () => undefined,
  applyUpdate: () => undefined,
  dismissUpdate: () => undefined,
  checkForUpdate: async () => undefined,
}

const PwaContext = createContext<PwaContextValue>(fallbackValue)

export function PwaProvider({ children }: PropsWithChildren) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [installed, setInstalled] = useState(isStandalone)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(installPromptIsSuppressed)
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const serviceWorkerHandle = useRef<BulkTextServiceWorkerHandle | null>(null)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)
  const reloadForUpdate = useRef(false)
  const lastUpdateCheckAt = useRef(0)

  const runUpdateCheck = useCallback(async (force: boolean) => {
    const handle = serviceWorkerHandle.current
    if (!handle || !navigator.onLine) return

    const now = Date.now()
    if (!force && now - lastUpdateCheckAt.current < UPDATE_CHECK_MIN_INTERVAL_MS) return
    lastUpdateCheckAt.current = now
    await handle.checkForUpdate()
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      void runUpdateCheck(true)
    }
    const handleOffline = () => setOnline(false)
    const handleInstalled = () => {
      clearInstallDismissal()
      setInstallDismissed(false)
      setInstalled(true)
      setInstallPrompt(null)
    }
    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setInstallPrompt(promptEvent)
      setInstallDismissed(installPromptIsSuppressed())
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('beforeinstallprompt', handleInstallPrompt)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
    }
  }, [runUpdateCheck])

  useEffect(() => {
    let active = true
    void registerBulkTextServiceWorker({
      onWaiting(worker) {
        if (!active) return

        if (waitingWorkerRef.current !== worker) {
          waitingWorkerRef.current = worker
          setUpdateDismissed(false)
        }
        setWaitingWorker(worker)
      },
      onError() {
        // PWA registration failure must never block the authenticated web workflow.
      },
    }).then((handle) => {
      if (!active) return
      serviceWorkerHandle.current = handle
      if (handle) void runUpdateCheck(true)
    })

    function handleControllerChange() {
      if (!reloadForUpdate.current) return
      reloadForUpdate.current = false
      window.location.reload()
    }

    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange)
    return () => {
      active = false
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [runUpdateCheck])

  useEffect(() => {
    function checkWhenVisible() {
      if (document.visibilityState === 'visible') void runUpdateCheck(false)
    }
    function checkOnFocus() {
      void runUpdateCheck(false)
    }

    document.addEventListener('visibilitychange', checkWhenVisible)
    window.addEventListener('focus', checkOnFocus)
    return () => {
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.removeEventListener('focus', checkOnFocus)
    }
  }, [runUpdateCheck])

  const dismissInstallPrompt = useCallback(() => {
    storeInstallDismissal()
    setInstallDismissed(true)
  }, [])

  const install = useCallback(async (): Promise<InstallOutcome> => {
    if (!installPrompt || installed) return 'unavailable'

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)

    if (choice.outcome === 'accepted') {
      clearInstallDismissal()
      setInstallDismissed(false)
      setInstalled(true)
    } else {
      storeInstallDismissal()
      setInstallDismissed(true)
    }

    return choice.outcome
  }, [installPrompt, installed])

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return
    reloadForUpdate.current = true
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }, [waitingWorker])

  const dismissUpdate = useCallback(() => setUpdateDismissed(true), [])
  const checkForUpdate = useCallback(async () => {
    await runUpdateCheck(true)
  }, [runUpdateCheck])

  const canInstall = Boolean(installPrompt) && !installed
  const value = useMemo<PwaContextValue>(() => ({
    online,
    installed,
    canInstall,
    installPromptVisible: canInstall && !installDismissed,
    updateAvailable: Boolean(waitingWorker) && !updateDismissed,
    install,
    dismissInstallPrompt,
    applyUpdate,
    dismissUpdate,
    checkForUpdate,
  }), [
    online,
    installed,
    canInstall,
    installDismissed,
    waitingWorker,
    updateDismissed,
    install,
    dismissInstallPrompt,
    applyUpdate,
    dismissUpdate,
    checkForUpdate,
  ])

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>
}

export function usePwa() {
  return useContext(PwaContext)
}
