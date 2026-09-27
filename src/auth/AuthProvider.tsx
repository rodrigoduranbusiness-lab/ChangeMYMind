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

type ProfileStats = Pick<
  AuthState,
  'wins' | 'streak' | 'longestStreak' | 'debateRoundCount' | 'debatesWon' | 'lastWinDateKey'
>

function profileStats(profile: {
  wins?: number
  streak?: number
  longestStreak?: number
  debateRoundCount?: number
  debatesWon?: number
  lastWinDateKey?: string | null
} | null): ProfileStats {
  return {
    wins: typeof profile?.wins === 'number' ? profile.wins : 0,
    streak: typeof profile?.streak === 'number' ? profile.streak : 0,
    longestStreak: typeof profile?.longestStreak === 'number' ? profile.longestStreak : 0,
    debateRoundCount: typeof profile?.debateRoundCount === 'number' ? profile.debateRoundCount : 0,
    debatesWon: typeof profile?.debatesWon === 'number' ? profile.debatesWon : 0,
    lastWinDateKey: typeof profile?.lastWinDateKey === 'string' ? profile.lastWinDateKey : null,
  }
}

const EMPTY_STATS: ProfileStats = {
  wins: 0,
  streak: 0,
  longestStreak: 0,
  debateRoundCount: 0,
  debatesWon: 0,
  lastWinDateKey: null,
}

function applyStats(
  setWins: (n: number) => void,
  setStreak: (n: number) => void,
  setLongestStreak: (n: number) => void,
  setDebateRoundCount: (n: number) => void,
  setDebatesWon: (n: number) => void,
  setLastWinDateKey: (k: string | null) => void,
  stats: ProfileStats,
) {
  setWins(stats.wins)
  setStreak(stats.streak)
  setLongestStreak(stats.longestStreak)
  setDebateRoundCount(stats.debateRoundCount)
  setDebatesWon(stats.debatesWon)
  setLastWinDateKey(stats.lastWinDateKey)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null)
  const [wins, setWins] = useState(0)
  const [streak, setStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [debateRoundCount, setDebateRoundCount] = useState(0)
  const [debatesWon, setDebatesWon] = useState(0)
  const [lastWinDateKey, setLastWinDateKey] = useState<string | null>(null)
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
        applyStats(
          setWins,
          setStreak,
          setLongestStreak,
          setDebateRoundCount,
          setDebatesWon,
          setLastWinDateKey,
          EMPTY_STATS,
        )
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
        applyStats(
          setWins,
          setStreak,
          setLongestStreak,
          setDebateRoundCount,
          setDebatesWon,
          setLastWinDateKey,
          profileStats(profile),
        )
      } catch (error) {
        console.error('Failed to load profile', error)
        setDiagnostic(null)
        applyStats(
          setWins,
          setStreak,
          setLongestStreak,
          setDebateRoundCount,
          setDebatesWon,
          setLastWinDateKey,
          EMPTY_STATS,
        )
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
      wins,
      streak,
      longestStreak,
      debateRoundCount,
      debatesWon,
      lastWinDateKey,
      loading,
      refreshDiagnostic: async () => {
        if (!user) return
        const profile = await getUserProfile(user.uid)
        setDiagnostic(profile?.diagnostic ?? null)
        applyStats(
          setWins,
          setStreak,
          setLongestStreak,
          setDebateRoundCount,
          setDebatesWon,
          setLastWinDateKey,
          profileStats(profile),
        )
      },
      refreshProfile: async () => {
        if (!user) return
        const profile = await getUserProfile(user.uid)
        setDiagnostic(profile?.diagnostic ?? null)
        applyStats(
          setWins,
          setStreak,
          setLongestStreak,
          setDebateRoundCount,
          setDebatesWon,
          setLastWinDateKey,
          profileStats(profile),
        )
      },
    }),
    [
      user,
      diagnostic,
      wins,
      streak,
      longestStreak,
      debateRoundCount,
      debatesWon,
      lastWinDateKey,
      loading,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
