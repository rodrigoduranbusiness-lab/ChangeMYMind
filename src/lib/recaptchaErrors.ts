/** User-facing copy when Firebase Auth has no Enterprise site key provisioned. */
export const AUTH_RECAPTCHA_SETUP_HINT =
  'Phone sign-in needs a reCAPTCHA Enterprise site key on your Firebase project (separate from App Check). In Firebase Console → Authentication → Settings, finish reCAPTCHA / fraud protection setup, add changemymind.tech to the key domains, then wait a few minutes. Or run: npm run setup:auth-recaptcha (with gcloud application-default login).'

export function isMissingAuthRecaptchaKeyError(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? ''
  const lower = message.toLowerCase()
  return (
    lower.includes('recaptchakey undefined') ||
    lower.includes('recaptcha enterprise site key undefined') ||
    lower.includes('no recaptcha enterprise sitekey')
  )
}

export function describeMissingAuthRecaptchaKeyError(): string {
  return `Phone sign-in is not wired to reCAPTCHA Enterprise yet. ${AUTH_RECAPTCHA_SETUP_HINT}`
}
