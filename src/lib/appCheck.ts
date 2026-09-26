import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'

import { app } from '../firebase'

const rawSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY
const siteKey = typeof rawSiteKey === 'string' ? rawSiteKey.trim() : ''

function isValidRecaptchaSiteKey(key: string): boolean {
  return /^6L[\w-]{20,}$/.test(key)
}

let ready: Promise<void> | null = null
let initialized = false

function loadEnterpriseScript(key: string): Promise<void> {
  const existing = document.querySelector('script[data-cg-app-check-recaptcha]')
  if (existing) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(key)}`
    script.async = true
    script.defer = true
    script.dataset.cgAppCheckRecaptcha = 'true'
    const timer = window.setTimeout(() => {
      reject(new Error('reCAPTCHA Enterprise script timed out.'))
    }, 6_000)
    script.onload = () => {
      window.clearTimeout(timer)
      resolve()
    }
    script.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error('Could not load reCAPTCHA Enterprise for App Check.'))
    }
    document.head.appendChild(script)
  })
}

/**
 * App Check after sign-in. Loading enterprise.js on the sign-in page breaks
 * Firebase Phone Auth's invisible reCAPTCHA (auth/captcha-check-failed).
 */
export function ensureAppCheck(): Promise<void> {
  if (
    !siteKey ||
    !isValidRecaptchaSiteKey(siteKey) ||
    import.meta.env.VITE_USE_EMULATORS === 'true'
  ) {
    if (import.meta.env.PROD && !siteKey) {
      console.warn(
        '[App Check] VITE_APPCHECK_SITE_KEY is missing from the production build. Redeploy with .env.local or hosting env vars set.',
      )
    }
    return Promise.resolve()
  }

  if (ready) {
    return ready
  }

  ready = (async () => {
    if (initialized) {
      return
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true
    }

    await loadEnterpriseScript(siteKey)
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
    initialized = true
  })().catch((error) => {
    ready = null
    throw error
  })

  return ready
}
