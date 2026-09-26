import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { DiagnosticResult } from '@shared/types'
import { auth } from '../firebase'
import { ensureUserProfile, getUserProfile } from '../lib/api'
import { AuthContext } from './context'
import type { AuthState } from './context'

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let settled = false
    const failsafe = window.setTimeout(() => {
      if (!settled) {
        console.warn('[Auth] Auth state took too long; continuing without a session.')
        setLoading(false)
      }
    }, 5_000)

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      settled = true
      window.clearTimeout(failsafe)
      setUser(nextUser)

      if (!nextUser) {
        setDiagnostic(null)
        setLoading(false)
        return
      }

      // Never block the whole app on App Check — a hung enterprise.js load used
      // to leave a blank spinner forever.
      void import('../lib/appCheck')
        .then(({ ensureAppCheck }) => ensureAppCheck())
        .catch((error) => {
          console.error('[App Check] Did not initialize.', error)
        })

      try {
        const profile = await withTimeout(
          ensureUserProfile(nextUser.uid, nextUser.phoneNumber),
          8_000,
          'Profile load',
        )
        setDiagnostic(profile.diagnostic ?? null)
      } catch (error) {
        console.error('Failed to load profile', error)
        setDiagnostic(null)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      settled = true
      window.clearTimeout(failsafe)
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      diagnostic,
      loading,
      refreshDiagnostic: async () => {
        if (!user) return
        const profile = await getUserProfile(user.uid)
        setDiagnostic(profile?.diagnostic ?? null)
      },
    }),
    [user, diagnostic, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
