import { useEffect, useState } from 'react'

import { normalizeSessionStatus } from '@shared/rules'
import type { DebateSession, SessionResults, SessionStatus } from '@shared/types'
import { useAuth } from '../auth/context'
import { finalizeSession, getSession } from '../lib/api'

export type SessionResultsState = {
  session: DebateSession | null
  results: SessionResults | null
  status: SessionStatus | null
  error: string | null
  loading: boolean
}

export function useSessionResults(sessionId: string | undefined): SessionResultsState {
  const { user } = useAuth()
  const [session, setSession] = useState<DebateSession | null>(null)
  const [results, setResults] = useState<SessionResults | null>(null)
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !sessionId) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const finalized = await finalizeSession(sessionId)
        if (cancelled) return

        setResults(finalized.results)
        setStatus(finalized.status)
        setSession(await getSession(user.uid, sessionId))
      } catch (caught) {
        console.error('Failed to load results', caught)
        if (cancelled) return

        const stored = await getSession(user.uid, sessionId).catch(() => null)
        if (stored?.results) {
          setSession(stored)
          setResults(stored.results)
          setStatus(normalizeSessionStatus(stored.status) ?? stored.status)
          return
        }
        setError('We could not load the results for this debate.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, sessionId])

  return { session, results, status, error, loading }
}
