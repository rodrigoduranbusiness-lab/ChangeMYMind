import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import Grain from './components/Grain'
import SetupNotice from './SetupNotice'
import './index.css'

const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const

const root = createRoot(document.getElementById('root')!)

const missing = REQUIRED_ENV.filter((key) => !import.meta.env[key])

if (missing.length) {
  // Firebase is imported lazily below precisely so this path can render. The
  // SDK throws during initialization on a missing API key, which would
  // otherwise leave a blank page.
  root.render(
    <StrictMode>
      <SetupNotice missing={[...missing]} />
      <Grain />
    </StrictMode>,
  )
} else {
  const [{ default: App }, { AuthProvider }] = await Promise.all([
    import('./App'),
    import('./auth/AuthProvider'),
  ])

  root.render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <Grain />
    </StrictMode>,
  )
}
