import { Link } from 'react-router-dom'
import {
  RecaptchaVerifier,
  initializeRecaptchaConfig,
  signInWithPhoneNumber,
} from 'firebase/auth'
import type { ConfirmationResult } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'

import OnboardingIntro from '../components/OnboardingIntro'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { auth, usingEmulators } from '../firebase'
import { formatUsPhone, isCompleteUsPhone } from '../lib/phoneFormat'
import {
  CODE_PROMPT,
  LINE_HEIGHT,
  LINE_SIZE,
  PHONE_PROMPT,
  stageShellStyle,
  textSlotStyle,
} from '../onboardingLayout'
import {
  describeMissingAuthRecaptchaKeyError,
  isMissingAuthRecaptchaKeyError,
} from '../lib/recaptchaErrors'
import * as s from '../theme'

type Step = 'intro' | 'phone' | 'code'

export default function SignIn() {
  const [step, setStep] = useState<Step>('intro')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const verifierRef = useRef<RecaptchaVerifier | null>(null)
  const widgetIdRef = useRef<number | null>(null)
  const confirmationRef = useRef<ConfirmationResult | null>(null)

  // Bumped to orphan an in-flight send, so a late result cannot move the UI.
  const attemptRef = useRef(0)

  useEffect(() => {
    return () => resetVerifier()
  }, [])

  /** Prefetch Auth's Enterprise key so failures surface before SMS, not as a blank render= URL. */
  useEffect(() => {
    if (step !== 'phone' || usingEmulators) {
      return
    }
    let cancelled = false
    initializeRecaptchaConfig(auth)
      .then(() => {
        if (!cancelled) {
          setError((prev) =>
            prev && isMissingAuthRecaptchaKeyError({ message: prev }) ? null : prev,
          )
        }
      })
      .catch((caught) => {
        if (!cancelled && isMissingAuthRecaptchaKeyError(caught)) {
          setError(describeMissingAuthRecaptchaKeyError())
        }
      })
    return () => {
      cancelled = true
    }
  }, [step])

  /**
   * Throws away the verifier *and* the DOM node it rendered into.
   *
   * Google's grecaptcha keeps an internal registry keyed by element, and
   * Firebase's `clear()` intentionally leaves the markup in place for an
   * invisible widget. So reusing the node — even emptied — fails with
   * "reCAPTCHA has already been rendered in this element". Every verifier
   * therefore gets a node grecaptcha has never seen.
   */
  function resetVerifier() {
    closeChallenge()
    verifierRef.current?.clear()
    verifierRef.current = null
    slotRef.current?.remove()
    slotRef.current = null
    widgetIdRef.current = null
  }

  /**
   * Dismisses an open image challenge. grecaptcha owns that overlay and
   * appends it to the body, so removing our own node would otherwise strand
   * it on screen.
   */
  function closeChallenge() {
    const widgetId = widgetIdRef.current
    const grecaptcha = (window as { grecaptcha?: { reset?: (id?: number) => void } }).grecaptcha
    if (widgetId === null || typeof grecaptcha?.reset !== 'function') {
      return
    }
    try {
      grecaptcha.reset(widgetId)
    } catch {
      // Already torn down by grecaptcha itself.
    }
  }

  /**
   * Invisible reCAPTCHA: nothing is shown unless Firebase decides the request
   * looks suspicious, in which case it renders its own challenge.
   */
  function getVerifier(): RecaptchaVerifier {
    if (!verifierRef.current) {
      const wrapper = wrapperRef.current
      if (!wrapper) {
        throw new Error('The reCAPTCHA container is not mounted yet.')
      }

      // A throwaway node, appended outside React's control so React never
      // tries to reconcile whatever grecaptcha injects into it.
      const slot = document.createElement('div')
      wrapper.appendChild(slot)
      slotRef.current = slot

      const verifier = new RecaptchaVerifier(auth, slot, { size: 'invisible' })
      verifierRef.current = verifier

      // Remember the widget so a cancelled attempt can close its challenge.
      verifier.render().then(
        (id) => {
          widgetIdRef.current = id
        },
        () => {
          widgetIdRef.current = null
        },
      )
    }
    return verifierRef.current
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const { e164 } = formatUsPhone(phone)
    if (!isCompleteUsPhone(e164)) {
      setError('Enter a full US number, like +1 (202) 555-0100.')
      return
    }

    const attempt = ++attemptRef.current
    setBusy(true)
    try {
      const confirmation = await signInWithPhoneNumber(auth, e164, getVerifier())
      if (attemptRef.current !== attempt) {
        return
      }
      confirmationRef.current = confirmation
      setStep('code')
    } catch (caught) {
      if (attemptRef.current !== attempt) {
        return
      }
      // The verifier is single-use once it has been consumed by a failed attempt.
      resetVerifier()
      setError(describeAuthError(caught))
    } finally {
      if (attemptRef.current === attempt) {
        setBusy(false)
      }
    }
  }

  /**
   * If the image challenge is dismissed rather than solved, grecaptcha reports
   * nothing and Firebase ignores the expiry, so the send never settles. Give
   * the form a way back without a page reload.
   */
  function cancelSend() {
    attemptRef.current += 1
    resetVerifier()
    setBusy(false)
    setError(null)
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!confirmationRef.current) {
      setError('That code request expired. Please start over.')
      setStep('phone')
      return
    }

    setBusy(true)
    try {
      // AuthProvider picks up the signed-in user and the router redirects.
      await confirmationRef.current.confirm(code.trim())
    } catch (caught) {
      setError(describeAuthError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...s.page, background: s.color.bg }}>
      <OnboardingTopBrand />
      {step === 'intro' ? (
        <OnboardingIntro onDone={() => setStep('phone')} />
      ) : (
        <>
        <AuthContinue
          prompt={step === 'phone' ? PHONE_PROMPT : CODE_PROMPT}
        >
          {step === 'phone' ? (
            <PhoneNumberForm
              phone={phone}
              setPhone={setPhone}
              busy={busy}
              onSubmit={sendCode}
              onCancelSend={cancelSend}
            />
          ) : (
            <form onSubmit={confirmCode} style={{ width: '100%' }}>
              <label htmlFor="code" style={s.label}>
                Verification code
              </label>
              <input
                id="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoFocus
                style={{
                  ...s.input,
                  letterSpacing: '0.35em',
                  fontFamily: s.font.mono,
                  fontSize: 16,
                  padding: '14px 16px',
                  minHeight: 48,
                  width: '100%',
                }}
              />
              <div style={{ marginTop: 10 }}>
                <button
                  type="submit"
                  disabled={busy || code.trim().length < 6}
                  style={{
                    ...s.disabled(
                      busy ? s.buttonPrimary : s.buttonSecondary,
                      busy || code.trim().length < 6,
                    ),
                    minHeight: 48,
                    fontSize: 16,
                  }}
                >
                  {busy ? 'Verifying…' : 'Next'}
                </button>
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone')
                    setCode('')
                    setError(null)
                    confirmationRef.current = null
                    resetVerifier()
                  }}
                  style={{ ...s.buttonSecondary, minHeight: 48 }}
                >
                  Use a different number
                </button>
              </div>
            </form>
          )}

          {error && <div style={s.errorBox}>{error}</div>}

          {usingEmulators && (
            <div style={s.noteBox}>
              Running against the Auth emulator. Use a test number from{' '}
              <code style={{ fontFamily: s.font.mono }}>README.md</code> — for example{' '}
              <code style={{ fontFamily: s.font.mono }}>+12025550100</code> with code{' '}
              <code style={{ fontFamily: s.font.mono }}>123456</code>.
            </div>
          )}
        </AuthContinue>
        <Link
          to="/education"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 22,
            textAlign: 'center',
            fontSize: 13,
            color: s.color.textMuted,
            textDecoration: 'none',
            zIndex: 20,
          }}
        >
          For education
        </Link>
        </>
      )}

      {/* Invisible reCAPTCHA slots are appended here — keep mounted across steps. */}
      <div ref={wrapperRef} />
    </div>
  )
}

/**
 * Same fixed slot as the intro typewriter, so phone/code feel like the next beat
 * in one sequence rather than a separate form page.
 */
function PhoneNumberForm({
  phone,
  setPhone,
  busy,
  onSubmit,
  onCancelSend,
}: {
  phone: string
  setPhone: (value: string) => void
  busy: boolean
  onSubmit: (event: React.FormEvent) => void
  onCancelSend: () => void
}) {
  const { e164 } = formatUsPhone(phone)
  const phoneComplete = isCompleteUsPhone(e164)

  return (
    <form
      onSubmit={onSubmit}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <input
        id="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="+1 (202) 555-0100"
        value={phone}
        onChange={(event) => setPhone(formatUsPhone(event.target.value).display)}
        autoFocus
        aria-label="Phone number"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: '10px 0',
          fontSize: 18,
          fontFamily: s.font.serif,
          color: s.color.text,
          background: 'transparent',
          border: 'none',
          borderBottom: `1px solid ${s.color.text}`,
          borderRadius: 0,
          outline: 'none',
          minHeight: 44,
        }}
      />
      <button
        type="submit"
        disabled={busy || !phoneComplete}
        style={{
          ...s.disabled(busy ? s.buttonPrimary : s.buttonSecondary, busy || !phoneComplete),
          minHeight: 48,
          fontSize: 16,
          marginTop: 96,
        }}
      >
        {busy ? 'Sending…' : 'Next'}
      </button>
      <p
        style={{
          ...s.subheading,
          fontSize: 12,
          marginTop: 14,
          marginBottom: 0,
          color: s.color.textFaint,
          lineHeight: 1.45,
        }}
      >
        By clicking Next, you agree to our{' '}
        <Link to="/terms" style={{ color: s.color.textMuted }}>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link to="/privacy" style={{ color: s.color.textMuted }}>
          Privacy Policy
        </Link>
        .
      </p>
      {busy && (
        <>
          <p style={{ ...s.subheading, fontSize: 13, margin: '12px 0 0' }}>
            If an image challenge appears, solve it to continue.
          </p>
          <button
            type="button"
            onClick={onCancelSend}
            style={{ ...s.buttonSecondary, minHeight: 48, marginTop: 10 }}
          >
            Cancel
          </button>
        </>
      )}
    </form>
  )
}

function AuthContinue({
  prompt,
  children,
}: {
  prompt: string
  children: React.ReactNode
}) {
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    setShowForm(false)
    const id = window.setTimeout(() => setShowForm(true), 80)
    return () => window.clearTimeout(id)
  }, [prompt])

  return (
    <div
      style={{
        ...stageShellStyle,
        outline: 'none',
        border: 'none',
        background: 'transparent',
      }}
    >
      <div style={{ ...textSlotStyle, paddingBottom: 8 }}>
        <p
          style={{
            margin: 0,
            marginBottom: 28,
            fontSize: LINE_SIZE,
            fontWeight: 500,
            lineHeight: LINE_HEIGHT,
            color: s.color.text,
          }}
        >
          {prompt}
        </p>
        <div
          style={{
            opacity: showForm ? 1 : 0,
            transform: showForm ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 700ms ease, transform 700ms ease',
            width: '100%',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function describeAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ''

  switch (code) {
    case 'auth/invalid-phone-number':
      return 'That phone number does not look right. Include the country code, like +15551234567.'
    case 'auth/invalid-verification-code':
      return 'That code was not correct. Check it and try again.'
    case 'auth/code-expired':
      return 'That code expired. Request a new one.'
    case 'auth/too-many-requests':
      return 'Too many attempts from this device. Wait a few minutes and try again.'
    case 'auth/quota-exceeded':
      return 'We have hit our SMS limit for now. Please try again later.'
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
      return 'The bot check did not pass. Try again and complete the image challenge if one appears. Disable ad blockers for this site, allow google.com/recaptcha, and use a normal browser window.'
    case 'auth/unauthorized-domain':
      return 'This web address is not authorized for sign-in yet. Use the main app link or contact support.'
    default:
      if (isMissingAuthRecaptchaKeyError(error)) {
        return describeMissingAuthRecaptchaKeyError()
      }
      return (error as { message?: string })?.message ?? 'Something went wrong. Please try again.'
  }
}
