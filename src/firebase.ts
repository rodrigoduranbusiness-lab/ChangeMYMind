import { getAI, GoogleAIBackend } from 'firebase/ai'
import { initializeApp } from 'firebase/app'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)

/**
 * App Check is what makes it safe to call the Gemini Live API from the
 * browser: the request is authorized by an attestation that this is really our
 * app, not by an API key we would otherwise have to ship. Optional locally.
 */
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)

/**
 * Firebase AI Logic proxies the Live API. The Gemini API key stays on Google's
 * side — it is never present in this bundle.
 */
export const ai = getAI(app, { backend: new GoogleAIBackend() })

export const LIVE_MODEL = import.meta.env.VITE_LIVE_MODEL ?? 'gemini-3.1-flash-live-preview'
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
