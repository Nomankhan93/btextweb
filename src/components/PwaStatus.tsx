import { useState } from 'react'
import { usePwa } from '../pwa/PwaProvider'

export function PwaStatusRegion() {
  const { online } = usePwa()

  return (
    <div className="pwa-status-region" aria-live="polite">
      {!online ? (
        <div className="pwa-status-banner pwa-offline-banner" role="status">
          <strong>You’re offline.</strong>
          <span>Draft editing can continue, but sending, live Phone &amp; SIM status and server updates require a connection.</span>
        </div>
      ) : null}
    </div>
  )
}

export function PwaInstallCard({ compact = false }: { compact?: boolean }) {
  const { installed, canInstall, install, online, checkForUpdate } = usePwa()
  const [installing, setInstalling] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function installApp() {
    setInstalling(true)
    setMessage(null)
    const outcome = await install()
    if (outcome === 'dismissed') setMessage('Installation was dismissed. You can try again later.')
    if (outcome === 'unavailable') setMessage('Use your browser’s Install app or Add to Home Screen option if it is available.')
    setInstalling(false)
  }

  if (compact && (installed || !canInstall)) return null

  return (
    <section className={`panel pwa-install-card${compact ? ' pwa-install-card-compact' : ''}`} aria-labelledby={compact ? 'pwa-install-compact-title' : 'pwa-install-title'}>
      <div className="pwa-install-brand">
        <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
        <div>
          <p className="eyebrow">Progressive Web App</p>
          <h2 id={compact ? 'pwa-install-compact-title' : 'pwa-install-title'}>{installed ? 'BulkText is installed' : 'Install BulkText'}</h2>
          <p>{installed ? 'BulkText can launch from your home screen or app launcher in standalone mode.' : 'Install BulkText for faster app-like access. Sending and live gateway actions still require an internet connection.'}</p>
        </div>
      </div>
      <div className="pwa-install-actions">
        {installed ? <span className="badge badge-success">Installed</span> : canInstall ? <button className="primary-button" type="button" disabled={installing} onClick={() => void installApp()}>{installing ? 'Opening installer…' : 'Install BulkText'}</button> : <span className="muted-copy">Use your browser menu’s Install app / Add to Home Screen option when available.</span>}
        {!compact && online ? <button className="secondary-button" type="button" onClick={() => void checkForUpdate()}>Check for update</button> : null}
      </div>
      {message ? <p className="notice warning-notice pwa-install-message" role="status">{message}</p> : null}
    </section>
  )
}
