import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'

import type { AiProvider } from '@shared/aiProvider'
import type {
  DebateSession,
  DiagnosticResult,
  FinalizeSessionResponse,
  JoinTextLobbyRequest,
  JoinTextLobbyResponse,
  ReplyTextTurnResponse,
  ReportConductRequest,
  ReportConductResponse,
  SessionOutcomeReason,
  Stance,
  StartSessionRequest,
  StartSessionResponse,
  SubmitTurnResponse,
  SyncTranscriptResponse,
  TopicId,
  TranscriptEntry,
  UserProfile,
} from '@shared/types'
import { abandonBeaconUrl, auth, db, functions } from '../firebase'

const callStartSession = httpsCallable<StartSessionRequest, StartSessionResponse>(
  functions,
  'startSession',
)

const callSubmitTurn = httpsCallable<
  { sessionId: string; userText: string; aiText: string },
  SubmitTurnResponse
>(functions, 'submitTurn')

const callReplyTextTurn = httpsCallable<
  { sessionId: string; userText: string },
  ReplyTextTurnResponse
>(functions, 'replyTextTurn')

const callFinalizeSession = httpsCallable<
  { sessionId: string; reason?: SessionOutcomeReason; transcript?: TranscriptEntry[] },
  FinalizeSessionResponse
>(functions, 'finalizeSession')

const callSyncTranscript = httpsCallable<
  { sessionId: string; entries: TranscriptEntry[] },
  SyncTranscriptResponse
>(functions, 'syncTranscript')

const callReportPause = httpsCallable<{ sessionId: string; pausedMs: number }, { deadline: number }>(
  functions,
  'reportPause',
)

const callReportConduct = httpsCallable<ReportConductRequest, ReportConductResponse>(
  functions,
  'reportConduct',
)

const callJoinTextLobby = httpsCallable<JoinTextLobbyRequest, JoinTextLobbyResponse>(
  functions,
  'joinTextLobby',
)

const callHeartbeatTextLobby = httpsCallable<JoinTextLobbyRequest, { ok: true }>(
  functions,
  'heartbeatTextLobby',
)

const callLeaveTextLobby = httpsCallable<{ topicId: string }, { ok: true }>(
  functions,
  'leaveTextLobby',
)

const callSendTextMessage = httpsCallable<
  { roomId: string; text: string },
  { outcome: 'continue' | 'lost'; reason: SessionOutcomeReason | null; messageId: string | null }
>(functions, 'sendTextMessage')

export async function startSession(
  opts: StartSessionRequest = {},
): Promise<StartSessionResponse> {
  const result = await callStartSession(opts)
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

export async function replyTextTurn(
  sessionId: string,
  userText: string,
): Promise<ReplyTextTurnResponse> {
  const result = await callReplyTextTurn({ sessionId, userText })
  return result.data
}

export async function finalizeSession(
  sessionId: string,
  reason?: SessionOutcomeReason,
  transcript?: TranscriptEntry[],
): Promise<FinalizeSessionResponse> {
  const result = await callFinalizeSession({ sessionId, reason, transcript })
  return result.data
}

export async function syncTranscript(
  sessionId: string,
  entries: TranscriptEntry[],
): Promise<number> {
  const result = await callSyncTranscript({ sessionId, entries })
  return result.data.length
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

export async function joinTextLobby(
  data: JoinTextLobbyRequest,
): Promise<JoinTextLobbyResponse> {
  const result = await callJoinTextLobby(data)
  return result.data
}

export async function heartbeatTextLobby(data: JoinTextLobbyRequest): Promise<void> {
  await callHeartbeatTextLobby(data)
}

export async function leaveTextLobby(topicId: string): Promise<void> {
  await callLeaveTextLobby({ topicId })
}

export async function sendTextMessage(
  roomId: string,
  text: string,
): Promise<{
  outcome: 'continue' | 'lost'
  reason: SessionOutcomeReason | null
  messageId: string | null
}> {
  const result = await callSendTextMessage({ roomId, text })
  return result.data
}

export interface LiveAccessCredentials {
  provider: AiProvider
  accessToken: string
  expiresAt: number
  wsUrl: string
  model: string
  location: string
  hueyDailyContext?: string
}

const callMintLiveAccess = httpsCallable<Record<string, never>, LiveAccessCredentials>(
  functions,
  'mintLiveAccess',
)

let liveAccessCache: { creds: LiveAccessCredentials; at: number } | null = null
let liveAccessInflight: Promise<LiveAccessCredentials> | null = null

const LIVE_ACCESS_TTL_MS = 8 * 60 * 1000

/**
 * Warm one Live credential while the user is still on the Allow-mic screen.
 * Grok ephemeral tokens are single-use — {@link mintLiveAccess} takes the
 * warmed token at most once, then remints for reconnects.
 */
export function prefetchLiveAccess(): void {
  if (liveAccessCache || liveAccessInflight) return
  liveAccessInflight = callMintLiveAccess({})
    .then((result) => {
      liveAccessCache = { creds: result.data, at: Date.now() }
      return result.data
    })
    .finally(() => {
      liveAccessInflight = null
    })
  void liveAccessInflight.catch(() => {
    liveAccessCache = null
  })
}

// --- Text lobby prefetch (optional single warm join — no poll loop) -------

export type TextLobbyPrefetchState = {
  topicId: TopicId
  stance: Stance
  startedAt: number
  /** Latest join result; null while the first join is still in flight. */
  result: JoinTextLobbyResponse | null
  failed: boolean
}

let textLobbyPrefetch: TextLobbyPrefetchState | null = null

/**
 * One optional warm join (e.g. hover on Text). No heartbeat/poll timers —
 * those burned thousands of callable invocations. TextDebate owns wait logic.
 */
export function prefetchTextLobby(topicId: TopicId, stance: Stance): void {
  if (
    textLobbyPrefetch &&
    textLobbyPrefetch.topicId === topicId &&
    textLobbyPrefetch.stance === stance &&
    !textLobbyPrefetch.failed
  ) {
    return
  }

  if (
    textLobbyPrefetch &&
    (textLobbyPrefetch.topicId !== topicId || textLobbyPrefetch.stance !== stance)
  ) {
    cancelTextLobbyPrefetch()
  }

  textLobbyPrefetch = {
    topicId,
    stance,
    startedAt: Date.now(),
    result: null,
    failed: false,
  }

  void joinTextLobby({ topicId, stance })
    .then((result) => {
      if (!textLobbyPrefetch) return
      if (
        textLobbyPrefetch.topicId !== topicId ||
        textLobbyPrefetch.stance !== stance
      ) {
        return
      }
      textLobbyPrefetch = { ...textLobbyPrefetch, result, failed: false }
    })
    .catch(() => {
      if (textLobbyPrefetch) {
        textLobbyPrefetch = { ...textLobbyPrefetch, failed: true }
      }
    })
}

/** Snapshot of the in-flight / completed lobby warm (does not transfer ownership). */
export function getTextLobbyPrefetch(): TextLobbyPrefetchState | null {
  return textLobbyPrefetch
}

/**
 * Hand off prefetch to TextDebate: return the snapshot and clear the module
 * cache. Does not leave the lobby.
 */
export function consumeTextLobbyPrefetch(): TextLobbyPrefetchState | null {
  const snap = textLobbyPrefetch
  textLobbyPrefetch = null
  return snap
}

/** Leave lobby + clear warm state (e.g. user picked Voice instead). */
export function cancelTextLobbyPrefetch(): void {
  const topicId = textLobbyPrefetch?.topicId
  textLobbyPrefetch = null
  if (topicId) {
    void leaveTextLobby(topicId).catch(() => {})
  }
}

/**
 * Short-lived Live WebSocket credential (Vertex OAuth or Grok ephemeral).
 * Prefetch may warm one token; this takes it once. Call again to remint —
 * required because xAI Grok client secrets are single-use per WebSocket.
 */
export async function mintLiveAccess(): Promise<LiveAccessCredentials> {
  if (liveAccessInflight) {
    await liveAccessInflight.catch(() => null)
  }

  if (liveAccessCache && Date.now() - liveAccessCache.at < LIVE_ACCESS_TTL_MS) {
    const creds = liveAccessCache.creds
    liveAccessCache = null
    return creds
  }

  const result = await callMintLiveAccess({})
  return result.data
}

// --- Firestore reads/writes the client is allowed to do --------------------

export async function ensureUserProfile(uid: string, phone: string | null): Promise<UserProfile> {
  const ref = doc(db, 'users', uid)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    await setDoc(ref, {
      phone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return {
      phone,
      createdAt: Date.now(),
      wins: 0,
      streak: 0,
      longestStreak: 0,
      debateRoundCount: 0,
      debatesWon: 0,
      lastWinDateKey: null,
    }
  }

  const data = snapshot.data() as UserProfile
  return {
    ...data,
    wins: typeof data.wins === 'number' ? data.wins : 0,
    streak: typeof data.streak === 'number' ? data.streak : 0,
    longestStreak: typeof data.longestStreak === 'number' ? data.longestStreak : 0,
    debateRoundCount: typeof data.debateRoundCount === 'number' ? data.debateRoundCount : 0,
    debatesWon: typeof data.debatesWon === 'number' ? data.debatesWon : 0,
    lastWinDateKey: typeof data.lastWinDateKey === 'string' ? data.lastWinDateKey : null,
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid))
  if (!snapshot.exists()) return null
  const data = snapshot.data() as UserProfile
  return {
    ...data,
    wins: typeof data.wins === 'number' ? data.wins : 0,
    streak: typeof data.streak === 'number' ? data.streak : 0,
    longestStreak: typeof data.longestStreak === 'number' ? data.longestStreak : 0,
    debateRoundCount: typeof data.debateRoundCount === 'number' ? data.debateRoundCount : 0,
    debatesWon: typeof data.debatesWon === 'number' ? data.debatesWon : 0,
    lastWinDateKey: typeof data.lastWinDateKey === 'string' ? data.lastWinDateKey : null,
  }
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
let cachedTranscriptForUnload: TranscriptEntry[] = []

export async function cacheIdToken(): Promise<void> {
  cachedIdToken = (await auth.currentUser?.getIdToken()) ?? null
}

/** Latest in-memory transcript for tab-close beacon (best-effort). */
export function cacheTranscriptForUnload(entries: TranscriptEntry[]): void {
  cachedTranscriptForUnload = entries
}

/**
 * Marks the session abandoned when the tab closes mid-debate. A callable would
 * not survive page teardown, so this goes out as a beacon and the function
 * verifies the token from the body.
 */
export function abandonSessionOnUnload(sessionId: string): void {
  if (!cachedIdToken) return

  const payload = JSON.stringify({
    idToken: cachedIdToken,
    sessionId,
    transcript: cachedTranscriptForUnload,
  })
  navigator.sendBeacon(
    abandonBeaconUrl(),
    new Blob([payload], { type: 'text/plain;charset=UTF-8' }),
  )
}
