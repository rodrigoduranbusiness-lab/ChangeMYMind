import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

/** Hostnames that should use {@link import.meta.env.VITE_FIREBASE_AUTH_DOMAIN_CUSTOM} when set. */
const CUSTOM_AUTH_HOSTS = new Set(['changemymind.tech', 'www.changemymind.tech'])

function resolveAuthDomain(): string {
  const defaultDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  const customDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN_CUSTOM?.trim()
  if (typeof window === 'undefined' || !customDomain) {
    return defaultDomain
  }
  return CUSTOM_AUTH_HOSTS.has(window.location.hostname) ? customDomain : defaultDomain
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

/** App Check is initialized after phone sign-in — see {@link ensureAppCheck}. */

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)

/** Voice name for Vertex Live speechConfig. */
export const LIVE_VOICE = import.meta.env.VITE_LIVE_VOICE ?? 'Charon'

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  // Skips the reCAPTCHA flow so the configured test numbers sign in without a
  // real SMS. Emulator-only: this has no effect against production Auth.
  auth.settings.appVerificationDisabledForTesting = true
}

export function abandonBeaconUrl(): string {
  const projectId = firebaseConfig.projectId
  return usingEmulators
    ? `http://127.0.0.1:5001/${projectId}/us-central1/abandonSession`
    : `https://us-central1-${projectId}.cloudfunctions.net/abandonSession`
}
