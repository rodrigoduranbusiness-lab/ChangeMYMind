import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import type { DiagnosticResult } from '@shared/types'
import { auth } from '../firebase'
import { ensureUserProfile, getUserProfile } from '../lib/api'
import { AuthContext } from './context'
import type { AuthState } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)

      if (!nextUser) {
        setDiagnostic(null)
        setLoading(false)
        return
      }

      try {
        // First sign-in creates users/{uid}; later sign-ins just read it.
        const profile = await ensureUserProfile(nextUser.uid, nextUser.phoneNumber)
        setDiagnostic(profile.diagnostic ?? null)
      } catch (error) {
        console.error('Failed to load profile', error)
        setDiagnostic(null)
      } finally {
        setLoading(false)
      }
    })
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
