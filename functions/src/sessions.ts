import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { GEMINI_API_KEY, REGION } from './config'
import { auth, db, sessionRef, userRef } from './firebase'
import { runJudge, runTakeaways } from './gemini'
import { decideOutcome, outcomeDescription } from './shared/rules'
import {
  DEBATE_DURATION_MS,
  LATE_TURN_GRACE_MS,
  MAX_JUDGE_EVALS,
  MAX_PAUSE_CREDIT_MS,
  buildResults,
} from './shared/scoring'
import { oppositeSide, sideFromLean } from './shared/topics'
import type {
  DebateSession,
  DiagnosticResult,
  FinalizeSessionRequest,
  FinalizeSessionResponse,
  JudgeEval,
  SessionOutcomeReason,
  StartSessionResponse,
  SubmitTurnRequest,
  SubmitTurnResponse,
  TranscriptEntry,
} from './shared/types'

const callOptions = { region: REGION, secrets: [GEMINI_API_KEY] }

function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }
  return uid
}

/** The moment the debate must be over, accounting for credited pause time. */
export function deadlineFor(session: Pick<DebateSession, 'startedAt' | 'pausedMs'>): number {
  const credited = Math.min(Math.max(session.pausedMs ?? 0, 0), MAX_PAUSE_CREDIT_MS)
  return session.startedAt + DEBATE_DURATION_MS + credited
}

async function loadDiagnostic(uid: string): Promise<DiagnosticResult> {
  const snapshot = await userRef(uid).get()
  const diagnostic = snapshot.get('diagnostic') as DiagnosticResult | undefined
  if (!diagnostic?.assignedTopic) {
    throw new HttpsError('failed-precondition', 'Complete the diagnostic first.')
  }
  return diagnostic
}

async function loadSession(uid: string, sessionId: string): Promise<DebateSession> {
  if (typeof sessionId !== 'string' || !sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.')
  }
  const snapshot = await sessionRef(uid, sessionId).get()
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Session not found.')
  }
  return snapshot.data() as DebateSession
}

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

/**
 * Creates the debate session and stamps `startedAt` from the server clock.
 * The client never gets to say when the debate began, so it cannot buy itself
 * extra time by lying about the start.
 */
export const startSession = onCall<unknown, Promise<StartSessionResponse>>(
  { region: REGION },
  async (request) => {
    const uid = requireUid(request)
    const diagnostic = await loadDiagnostic(uid)

    const topic = diagnostic.assignedTopic
    const lean = diagnostic.topicLeans?.[topic] ?? 0
    const userSide = sideFromLean(lean)
    const debaterSide = oppositeSide(userSide)

    // Only one debate may be live at a time; anything still open was left behind.
    const stale = await userRef(uid)
      .collection('sessions')
      .where('status', '==', 'active')
      .get()

    const batch = db.batch()
    for (const doc of stale.docs) {
      batch.update(doc.ref, {
        status: 'abandoned',
        outcomeReason: 'abandoned',
        endedAt: Date.now(),
      })
    }

    const startedAt = Date.now()
    const ref = userRef(uid).collection('sessions').doc()
    const session: DebateSession = {
      topic,
      userSide,
      debaterSide,
      startedAt,
      endedAt: null,
      status: 'active',
      outcomeReason: null,
      pausedMs: 0,
      transcript: [],
      judgeEvals: [],
    }
    batch.set(ref, session)
    await batch.commit()

    logger.info('Session started', { uid, sessionId: ref.id, topic, debaterSide })

    return {
      sessionId: ref.id,
      topic,
      userSide,
      debaterSide,
      startedAt,
      deadline: deadlineFor(session),
    }
  },
)

// ---------------------------------------------------------------------------
// submitTurn
// ---------------------------------------------------------------------------

/**
 * Called after each completed exchange. Appends the transcript, runs the
 * judge, and decides server-side whether the debate is over.
 *
 * The response carries no scores — only whether to keep going. That is what
 * keeps the client from rendering a meter or leaking a hint mid-debate.
 */
export const submitTurn = onCall<SubmitTurnRequest, Promise<SubmitTurnResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, userText, aiText } = request.data ?? {}

    const session = await loadSession(uid, sessionId)
    if (session.status !== 'active') {
      return { outcome: session.status === 'won' ? 'won' : 'lost', reason: session.outcomeReason, remainingMs: 0 }
    }

    const now = Date.now()
    const deadline = deadlineFor(session)

    const cleanUser = sanitizeSpeech(userText)
    const cleanAi = sanitizeSpeech(aiText)

    const additions: TranscriptEntry[] = []
    if (cleanUser) additions.push({ speaker: 'user', text: cleanUser, ts: now })
    if (cleanAi) additions.push({ speaker: 'ai', text: cleanAi, ts: now })

    // A turn that arrives after the deadline loses; it cannot be judged into a win.
    if (now > deadline + LATE_TURN_GRACE_MS) {
      await endSession(uid, sessionId, 'lost', 'timeout', additions)
      return { outcome: 'lost', reason: 'timeout', remainingMs: 0 }
    }

    const transcript = [...session.transcript, ...additions]

    // The judge scores the user, so a turn with no user speech (the debater's
    // opening, for instance) is recorded but not evaluated.
    const shouldJudge =
      cleanUser.length >= 2 && session.judgeEvals.length < MAX_JUDGE_EVALS

    if (!shouldJudge) {
      // arrayUnion so this cannot clobber a write from an in-flight judge call.
      await sessionRef(uid, sessionId).update({
        transcript: FieldValue.arrayUnion(...additions),
      })
      return { outcome: 'continue', reason: null, remainingMs: Math.max(0, deadline - now) }
    }

    let evaluation: JudgeEval
    try {
      const scores = await runJudge({
        apiKey: GEMINI_API_KEY.value(),
        topic: session.topic,
        debaterSide: session.debaterSide,
        transcript,
      })
      evaluation = { ...scores, ts: Date.now(), turnIndex: transcript.length }
    } catch (error) {
      // A judge failure must not end the debate or block the conversation.
      logger.error('Judge call failed; recording turn without an evaluation', error)
      await sessionRef(uid, sessionId).update({
        transcript: FieldValue.arrayUnion(...additions),
      })
      return { outcome: 'continue', reason: null, remainingMs: Math.max(0, deadline - now) }
    }

    // Re-read inside a transaction: the debate may have ended (timer expiry,
    // abandonment) while the judge was thinking.
    const decision = await db.runTransaction(async (tx) => {
      const ref = sessionRef(uid, sessionId)
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined

      if (!current || current.status !== 'active') {
        return {
          outcome: current?.status === 'won' ? ('won' as const) : ('lost' as const),
          reason: current?.outcomeReason ?? null,
        }
      }

      const evals = [...current.judgeEvals, evaluation]
      const result = decideOutcome(evals)

      const update: Record<string, unknown> = {
        transcript: [...current.transcript, ...additions],
        judgeEvals: evals,
      }

      if (result.outcome !== 'continue') {
        update.status = result.outcome
        update.outcomeReason = result.reason
        update.endedAt = Date.now()
      }

      tx.update(ref, update)
      return result
    })

    if (decision.outcome !== 'continue') {
      logger.info('Session decided', { uid, sessionId, ...decision })
    }

    return {
      outcome: decision.outcome,
      reason: decision.reason,
      remainingMs: Math.max(0, deadline - Date.now()),
    }
  },
)

// ---------------------------------------------------------------------------
// reportPause
// ---------------------------------------------------------------------------

/**
 * Credits back time lost to a dropped connection. Capped in total so it cannot
 * be used to stretch a six-minute debate indefinitely.
 */
export const reportPause = onCall<{ sessionId: string; pausedMs: number }, Promise<{ deadline: number }>>(
  { region: REGION },
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, pausedMs } = request.data ?? {}

    const requested = Number(pausedMs)
    if (!Number.isFinite(requested) || requested <= 0) {
      throw new HttpsError('invalid-argument', 'pausedMs must be a positive number.')
    }

    const ref = sessionRef(uid, sessionId)
    const deadline = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined
      if (!current || current.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Session is not active.')
      }

      const pausedTotal = Math.min(
        (current.pausedMs ?? 0) + Math.min(requested, MAX_PAUSE_CREDIT_MS),
        MAX_PAUSE_CREDIT_MS,
      )
      tx.update(ref, { pausedMs: pausedTotal })
      return deadlineFor({ startedAt: current.startedAt, pausedMs: pausedTotal })
    })

    return { deadline }
  },
)

// ---------------------------------------------------------------------------
// finalizeSession
// ---------------------------------------------------------------------------

/**
 * Closes out a session and computes the results. Idempotent: if results have
 * already been written, they are returned as-is, so a refresh or a duplicate
 * call cannot rewrite the outcome.
 */
export const finalizeSession = onCall<FinalizeSessionRequest, Promise<FinalizeSessionResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, reason } = request.data ?? {}

    const session = await loadSession(uid, sessionId)

    if (session.results) {
      return { status: session.status, reason: session.outcomeReason, results: session.results }
    }

    let status = session.status
    let outcomeReason: SessionOutcomeReason | null = session.outcomeReason

    if (status === 'active') {
      // The server decides, not the client. The only thing the client's
      // `reason` can do is mark a session as abandoned.
      if (reason === 'abandoned') {
        status = 'abandoned'
        outcomeReason = 'abandoned'
      } else {
        const decision = decideOutcome(session.judgeEvals)
        if (decision.outcome !== 'continue') {
          status = decision.outcome
          outcomeReason = decision.reason
        } else if (Date.now() >= deadlineFor(session) - LATE_TURN_GRACE_MS) {
          status = 'lost'
          outcomeReason = 'timeout'
        } else {
          throw new HttpsError(
            'failed-precondition',
            'The debate is still running and has not been decided.',
          )
        }
      }
    }

    const diagnostic = await loadDiagnostic(uid)
    const takeaways = await runTakeaways({
      apiKey: GEMINI_API_KEY.value(),
      topic: session.topic,
      debaterSide: session.debaterSide,
      transcript: session.transcript,
      outcome: outcomeDescription(status, outcomeReason),
    })

    const results = buildResults({
      diagnostic,
      evals: session.judgeEvals,
      assignedTopic: session.topic,
      takeaways,
    })

    await sessionRef(uid, sessionId).update({
      status,
      outcomeReason,
      endedAt: session.endedAt ?? Date.now(),
      results,
    })

    logger.info('Session finalized', { uid, sessionId, status, outcomeReason })

    return { status, reason: outcomeReason, results }
  },
)

// ---------------------------------------------------------------------------
// abandonSession (beacon)
// ---------------------------------------------------------------------------

/**
 * Called via `navigator.sendBeacon` when the tab closes mid-debate. A callable
 * is not reliable during page teardown, so this is a plain request that
 * verifies the ID token out of the body itself.
 */
export const abandonSession = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      idToken?: string
      sessionId?: string
    }

    if (!body?.idToken || !body?.sessionId) {
      res.status(400).send('Missing idToken or sessionId')
      return
    }

    const decoded = await auth.verifyIdToken(body.idToken)
    const ref = sessionRef(decoded.uid, body.sessionId)

    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined
      if (!current || current.status !== 'active') {
        return
      }
      tx.update(ref, {
        status: 'abandoned',
        outcomeReason: 'abandoned',
        endedAt: Date.now(),
      })
    })

    res.status(204).send('')
  } catch (error) {
    logger.error('abandonSession failed', error)
    res.status(400).send('Bad request')
  }
})

// ---------------------------------------------------------------------------

async function endSession(
  uid: string,
  sessionId: string,
  status: 'won' | 'lost',
  reason: SessionOutcomeReason,
  additions: TranscriptEntry[],
): Promise<void> {
  const ref = sessionRef(uid, sessionId)
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref)
    const current = snapshot.data() as DebateSession | undefined
    if (!current || current.status !== 'active') {
      return
    }
    tx.update(ref, {
      status,
      outcomeReason: reason,
      endedAt: Date.now(),
      transcript: [...current.transcript, ...additions],
    })
  })
}

/** Transcribed speech only: trimmed, length-capped, no control characters. */
function sanitizeSpeech(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .trim()
    .slice(0, 4000)
}
