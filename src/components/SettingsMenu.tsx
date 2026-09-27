import { signOut } from 'firebase/auth'
import { Settings } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/context'
import { auth } from '../firebase'
import { deleteAccount } from '../lib/api'
import { EDGE_PADDING } from '../onboardingLayout'
import * as s from '../theme'

const gearButtonStyle: CSSProperties = {
  position: 'fixed',
  top: `max(16px, env(safe-area-inset-top))`,
  right: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
  zIndex: 200,
  width: 44,
  height: 44,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: s.color.text,
  fontFamily: s.font.serif,
}

const rowButton: CSSProperties = {
  ...s.buttonSecondary,
  minHeight: 44,
  fontSize: 15,
  borderColor: 'rgba(255, 255, 255, 0.14)',
  background: 'rgba(255, 255, 255, 0.03)',
}

/**
 * Gear in the corner on signed-in screens. Opens privacy, logout, and
 * delete-account controls.
 */
export default function SettingsMenu() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!user) return null

  async function logout() {
    setBusy(true)
    try {
      await signOut(auth)
      setOpen(false)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  async function removeAccount() {
    if (!user) return
    setBusy(true)
    setMessage(null)
    try {
      await deleteAccount()
      await signOut(auth).catch(() => undefined)
      setOpen(false)
      navigate('/', { replace: true })
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : 'Could not delete the account. Try again in a moment.',
      )
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        onClick={() => {
          setOpen(true)
          setMessage(null)
          setConfirmDelete(false)
        }}
        style={gearButtonStyle}
      >
        <Settings size={22} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 210,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `max(20px, env(safe-area-inset-top)) max(${EDGE_PADDING}px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(${EDGE_PADDING}px, env(safe-area-inset-left))`,
            boxSizing: 'border-box',
            ...s.glassOverlay,
          }}
          onClick={() => !busy && setOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 380,
              maxHeight: 'min(90dvh, 640px)',
              overflowY: 'auto',
              padding: '22px 22px 24px',
              boxSizing: 'border-box',
              ...s.glass,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 22,
              }}
            >
              <h2 style={{ ...s.heading, fontSize: 20, margin: 0, fontWeight: 600 }}>Settings</h2>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  margin: 0,
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: s.color.textMuted,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontFamily: s.font.serif,
                  fontSize: 22,
                  lineHeight: 1,
                  opacity: busy ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>

            {user.phoneNumber && (
              <p style={{ ...s.subheading, fontSize: 13, margin: '0 0 18px' }}>
                Signed in as {user.phoneNumber}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link
                to="/diagnostic"
                onClick={() => setOpen(false)}
                style={{
                  ...rowButton,
                  display: 'block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                  lineHeight: '44px',
                }}
              >
                Retake the questions
              </Link>

              <Link
                to="/terms"
                onClick={() => setOpen(false)}
                style={{
                  ...rowButton,
                  display: 'block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                  lineHeight: '44px',
                }}
              >
                Terms of service
              </Link>

              <Link
                to="/privacy"
                onClick={() => setOpen(false)}
                style={{
                  ...rowButton,
                  display: 'block',
                  textAlign: 'center',
                  textDecoration: 'none',
                  boxSizing: 'border-box',
                  lineHeight: '44px',
                }}
              >
                Privacy policy
              </Link>

              <button
                type="button"
                disabled={busy}
                onClick={() => void logout()}
                style={s.disabled(rowButton, busy)}
              >
                Log out
              </button>

              {!confirmDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    ...s.disabled(rowButton, busy),
                    color: s.color.danger,
                    border: 'none',
                    background: 'rgba(224, 112, 112, 0.06)',
                  }}
                >
                  Delete account
                </button>
              ) : (
                <div
                  style={{
                    padding: 14,
                    ...s.glass,
                    background: 'rgba(224, 112, 112, 0.08)',
                    border: 'none',
                  }}
                >
                  <p style={{ ...s.subheading, fontSize: 14, margin: '0 0 12px', color: s.color.danger }}>
                    This permanently deletes your account and debate history. This cannot be undone.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeAccount()}
                      style={{
                        ...s.disabled(s.buttonPrimary, busy),
                        minHeight: 44,
                        fontSize: 15,
                        background: s.color.danger,
                        border: 'none',
                        color: s.color.text,
                      }}
                    >
                      {busy ? 'Deleting…' : 'Yes, delete my account'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(false)}
                      style={s.disabled(rowButton, busy)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {message && (
              <p
                style={{
                  ...s.subheading,
                  fontSize: 13,
                  marginTop: 16,
                  marginBottom: 0,
                  color: s.color.textMuted,
                }}
              >
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
