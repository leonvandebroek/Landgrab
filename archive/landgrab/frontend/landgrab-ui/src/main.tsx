import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// i18n must be initialized before rendering so t() is available on first render.
import './i18n/index'
// Global CSS is in styles/index.css, imported by App.tsx
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
