import { useState } from 'react'
import { usePwa } from '../pwa/PwaProvider'

export function PwaExperiencePrompts() {
  const {
    installPromptVisible,
    updateAvailable,
    install,
    dismissInstallPrompt,
    applyUpdate,
    dismissUpdate,
  } = usePwa()
  const [installing, setInstalling] = useState(false)

  async function installApp() {
    setInstalling(true)
    try {
      await install()
    } finally {
      setInstalling(false)
    }
  }

  if (updateAvailable) {
    return (
      <aside className="pwa-experience-stack" aria-live="polite">
        <section className="pwa-experience-prompt pwa-experience-update" role="status" aria-labelledby="pwa-update-title">
          <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
          <div className="pwa-experience-copy">
            <strong id="pwa-update-title">BulkText update ready</strong>
            <span>A newer version has downloaded. Update when you’re ready; the current page will reload once.</span>
          </div>
          <div className="pwa-experience-actions">
            <button className="secondary-button" type="button" onClick={dismissUpdate}>Later</button>
            <button className="primary-button" type="button" onClick={applyUpdate}>Update now</button>
          </div>
        </section>
      </aside>
    )
  }

  if (!installPromptVisible) return null

  return (
    <aside className="pwa-experience-stack" aria-live="polite">
      <section className="pwa-experience-prompt pwa-experience-install" role="status" aria-labelledby="pwa-install-prompt-title">
        <img src="/icons/icon-192.png" alt="" aria-hidden="true" />
        <div className="pwa-experience-copy">
          <strong id="pwa-install-prompt-title">Install BulkText App</strong>
          <span>Add BulkText to your phone for faster access and an app-like experience.</span>
        </div>
        <div className="pwa-experience-actions">
          <button className="secondary-button" type="button" onClick={dismissInstallPrompt}>Not now</button>
          <button className="primary-button" type="button" disabled={installing} onClick={() => void installApp()}>
            {installing ? 'Opening installer…' : 'Install App'}
          </button>
        </div>
      </section>
    </aside>
  )
}
