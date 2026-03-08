import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Global CSS is in styles/index.css, imported by App.tsx
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
