/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  /** Optional: Auth handler domain when the app is served on changemymind.tech (Firebase Auth custom domain). */
  readonly VITE_FIREBASE_AUTH_DOMAIN_CUSTOM?: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_LIVE_MODEL?: string
  readonly VITE_LIVE_VOICE?: string
  readonly VITE_APPCHECK_SITE_KEY?: string
  readonly VITE_USE_EMULATORS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
