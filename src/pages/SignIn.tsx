import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import type { ConfirmationResult } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'

import { auth, usingEmulators } from '../firebase'
import * as s from '../theme'

type Step = 'phone' | 'code'

export default function SignIn() {
  const [step, setStep] = useState<Step>('phone')
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

    const normalized = phone.trim()
    if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
      setError('Enter your number in international format, like +15551234567.')
      return
    }

    const attempt = ++attemptRef.current
    setBusy(true)
    try {
      const confirmation = await signInWithPhoneNumber(auth, normalized, getVerifier())
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
    <div style={s.page}>
      <div style={s.card}>
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: s.color.accent,
              marginBottom: 12,
            }}
          >
            Common Ground
          </div>
          <h1 style={s.heading}>Can you change a mind?</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>
            Answer ten questions, then spend six minutes debating an AI that argues the
            opposite of what you believe. See how you actually do.
          </p>
        </div>

        {step === 'phone' ? (
          <form onSubmit={sendCode}>
            <label htmlFor="phone" style={s.label}>
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="+15551234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              style={s.input}
            />
            <div style={{ marginTop: 16 }}>
              <button type="submit" disabled={busy} style={s.disabled(s.buttonPrimary, busy)}>
                {busy ? 'Sending code…' : 'Send code'}
              </button>
            </div>
            {busy && (
              <div style={{ marginTop: 10 }}>
                <p style={{ ...s.subheading, fontSize: 12, marginBottom: 10 }}>
                  If an image challenge appears, solve it to continue.
                </p>
                <button type="button" onClick={cancelSend} style={s.buttonSecondary}>
                  Cancel
                </button>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={confirmCode}>
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
              style={{ ...s.input, letterSpacing: '0.35em', fontFamily: s.font.mono }}
            />
            <div style={{ marginTop: 16 }}>
              <button type="submit" disabled={busy} style={s.disabled(s.buttonPrimary, busy)}>
                {busy ? 'Verifying…' : 'Verify and continue'}
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
                style={s.buttonSecondary}
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

        <p style={{ ...s.subheading, fontSize: 12, marginTop: 20, color: s.color.textFaint }}>
          We use your number only to sign you in.
        </p>

        {/* Invisible reCAPTCHA slots are appended here. */}
        <div ref={wrapperRef} />
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
      return 'The bot check did not pass. Try again, and solve the image challenge if one appears.'
    default:
      return (error as { message?: string })?.message ?? 'Something went wrong. Please try again.'
  }
}
