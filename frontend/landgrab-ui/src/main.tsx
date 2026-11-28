import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
// i18n must be initialized before rendering so t() is available on first render.
import './i18n/index'
// Global CSS is in styles/index.css, imported by App.tsx
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Spectators open /watch. It is its own small app, so players never load it.
const isWatchRoute = window.location.pathname.replace(/\/+$/, '') === '/watch'
const WatchApp = lazy(() => import('./watch/WatchApp.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isWatchRoute ? (
        <Suspense fallback={null}>
          <WatchApp />
        </Suspense>
      ) : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
