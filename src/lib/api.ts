import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

import type {
  DebateSession,
  DiagnosticResult,
  FinalizeSessionResponse,
  ReportConductRequest,
  ReportConductResponse,
  SessionOutcomeReason,
  StartSessionResponse,
  SubmitTurnResponse,
  UserProfile,
} from '@shared/types'
import { abandonBeaconUrl, auth, db, functions } from '../firebase'

const callStartSession = httpsCallable<Record<string, never>, StartSessionResponse>(
  functions,
  'startSession',
)

const callSubmitTurn = httpsCallable<
  { sessionId: string; userText: string; aiText: string },
  SubmitTurnResponse
>(functions, 'submitTurn')

const callFinalizeSession = httpsCallable<
  { sessionId: string; reason?: SessionOutcomeReason },
  FinalizeSessionResponse
>(functions, 'finalizeSession')

const callReportPause = httpsCallable<{ sessionId: string; pausedMs: number }, { deadline: number }>(
  functions,
  'reportPause',
)

const callReportConduct = httpsCallable<ReportConductRequest, ReportConductResponse>(
  functions,
  'reportConduct',
)

export async function startSession(): Promise<StartSessionResponse> {
  const result = await callStartSession({})
  return result.data
}

export async function submitTurn(
  sessionId: string,
  userText: string,
  aiText: string,
): Promise<SubmitTurnResponse> {
  const result = await callSubmitTurn({ sessionId, userText, aiText })
  return result.data
}

export async function finalizeSession(
  sessionId: string,
  reason?: SessionOutcomeReason,
): Promise<FinalizeSessionResponse> {
  const result = await callFinalizeSession({ sessionId, reason })
  return result.data
}

export async function reportPause(sessionId: string, pausedMs: number): Promise<number> {
  const result = await callReportPause({ sessionId, pausedMs })
  return result.data.deadline
}

export async function reportConduct(
  sessionId: string,
  kind: ReportConductRequest['kind'],
  turn?: number,
): Promise<ReportConductResponse> {
  const result = await callReportConduct({ sessionId, kind, turn })
  return result.data
}

export interface LiveAccessCredentials {
  accessToken: string
  expiresAt: number
  wsUrl: string
  model: string
  location: string
}

const callMintLiveAccess = httpsCallable<Record<string, never>, LiveAccessCredentials>(
  functions,
  'mintLiveAccess',
)

let liveAccessCache: { creds: LiveAccessCredentials; at: number } | null = null
let liveAccessInflight: Promise<LiveAccessCredentials> | null = null

const LIVE_ACCESS_TTL_MS = 8 * 60 * 1000

/** Warm the Live token while the user is still on the Allow-mic screen. */
export function prefetchLiveAccess(): void {
  void mintLiveAccess().catch(() => {
    // Best-effort; start() will retry.
  })
}

/** Short-lived Vertex token for the browser Live WebSocket. */
export async function mintLiveAccess(): Promise<LiveAccessCredentials> {
  const now = Date.now()
  if (liveAccessCache && now - liveAccessCache.at < LIVE_ACCESS_TTL_MS) {
    return liveAccessCache.creds
  }
  if (liveAccessInflight) {
    return liveAccessInflight
  }

  liveAccessInflight = callMintLiveAccess({})
    .then((result) => {
      liveAccessCache = { creds: result.data, at: Date.now() }
      return result.data
    })
    .finally(() => {
      liveAccessInflight = null
    })

  return liveAccessInflight
}

// --- Firestore reads/writes the client is allowed to do --------------------

export async function ensureUserProfile(uid: string, phone: string | null): Promise<UserProfile> {
  const ref = doc(db, 'users', uid)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    await setDoc(ref, { phone, createdAt: Date.now(), updatedAt: serverTimestamp() })
    return { phone, createdAt: Date.now() }
  }

  return snapshot.data() as UserProfile
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid))
  return snapshot.exists() ? (snapshot.data() as UserProfile) : null
}

export async function saveDiagnostic(uid: string, diagnostic: DiagnosticResult): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    diagnostic: { ...diagnostic, completedAt: Date.now() },
    updatedAt: serverTimestamp(),
  })
}

export async function deleteAccount(): Promise<void> {
  const call = httpsCallable<Record<string, never>, { ok: true }>(functions, 'deleteAccount')
  await call({})
}

export async function getSession(uid: string, sessionId: string): Promise<DebateSession | null> {
  const snapshot = await getDoc(doc(db, 'users', uid, 'sessions', sessionId))
  return snapshot.exists() ? (snapshot.data() as DebateSession) : null
}

/**
 * The beacon has to be sent synchronously while the page is tearing down, so
 * the ID token is fetched up front and kept here rather than awaited at the
 * moment of unload.
 */
let cachedIdToken: string | null = null

export async function cacheIdToken(): Promise<void> {
  cachedIdToken = (await auth.currentUser?.getIdToken()) ?? null
}

/**
 * Marks the session abandoned when the tab closes mid-debate. A callable would
 * not survive page teardown, so this goes out as a beacon and the function
 * verifies the token from the body.
 */
export function abandonSessionOnUnload(sessionId: string): void {
  if (!cachedIdToken) return

  const payload = JSON.stringify({ idToken: cachedIdToken, sessionId })
  navigator.sendBeacon(
    abandonBeaconUrl(),
    new Blob([payload], { type: 'text/plain;charset=UTF-8' }),
  )
}
