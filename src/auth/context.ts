import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'

import type { DiagnosticResult } from '@shared/types'

export interface AuthState {
  user: User | null
  /** The saved diagnostic, or null if they have not taken it yet. */
  diagnostic: DiagnosticResult | null
  loading: boolean
  refreshDiagnostic: () => Promise<void>
}

export const AuthContext = createContext<AuthState | undefined>(undefined)

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
