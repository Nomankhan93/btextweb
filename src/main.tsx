import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { installGlobalObservability } from './lib/observability'
import { PwaProvider } from './pwa/PwaProvider'
import './styles/app.css'

const AppBootstrap = lazy(() => import('./AppBootstrap'))
const PwaExperiencePrompts = lazy(() => import('./components/PwaExperiencePrompts').then((module) => ({ default: module.PwaExperiencePrompts })))

installGlobalObservability()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaProvider>
      <Suspense fallback={null}>
        <PwaExperiencePrompts />
      </Suspense>
      <BrowserRouter>
        <AppErrorBoundary>
          <Suspense fallback={<div className="page-state loading-state" role="status">Loading BulkText…</div>}>
            <AppBootstrap />
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </PwaProvider>
  </StrictMode>,
)
