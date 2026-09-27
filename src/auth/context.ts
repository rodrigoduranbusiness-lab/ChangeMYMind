import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

import type { DiagnosticResult } from '@shared/types'

export interface AuthState {
  user: User | null
  /** The saved diagnostic, or null if they have not taken it yet. */
  diagnostic: DiagnosticResult | null
  /** Lifetime day-wins (server-maintained). Defaults to 0. */
  wins: number
  /** Consecutive win days (server-maintained). Defaults to 0. */
  streak: number
  /** Max consecutive win days ever (server-maintained). Defaults to 0. */
  longestStreak: number
  /** Total debates started (server-maintained). Defaults to 0. */
  debateRoundCount: number
  /** Lifetime debate wins — every passed/won session (server-maintained). */
  debatesWon: number
  /** YYYY-MM-DD of last win day, or null. */
  lastWinDateKey: string | null
  loading: boolean
  refreshDiagnostic: () => Promise<void>
  /** Reload wins / streak / diagnostic from Firestore. */
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
