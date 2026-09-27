import type { DocumentReference, Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { REGION } from './config'
import { auth, db, debateRoundRef, sessionRef, userRef } from './firebase'
import { runSessionJudge, runTakeaways } from './llm'
import { detectInstantLossSpeech, INTERRUPTIONS_TO_LOSE } from './shared/conduct'
import { looksLikePromptInjection } from './shared/promptGuard'
import {
  appendEventLog,
  interruptionCount,
  mapConductKindToEventType,
} from './shared/eventLog'
import {
  decideOutcomeFromEvents,
  decideOutcomeFromVerdict,
  outcomeDescription,
} from './shared/rules'
import {
  DEBATE_DURATION_MS,
  LATE_TURN_GRACE_MS,
  MAX_PAUSE_CREDIT_MS,
  buildResults,
} from './shared/scoring'
import { oppositeSide, sideFromLean } from './shared/topics'
import { mergeTranscriptAppend, sanitizeTranscriptList } from './shared/transcriptMerge'
import type {
  DebateRoundRecord,
  DebateSession,
  DiagnosticResult,
  FinalizeSessionRequest,
  FinalizeSessionResponse,
  EventLogEntry,
  ReportConductRequest,
  ReportConductResponse,
  SessionOutcomeReason,
  SessionStatus,
  StartSessionResponse,
  SubmitTurnRequest,
  SubmitTurnResponse,
  SyncTranscriptRequest,
  SyncTranscriptResponse,
  TranscriptEntry,
} from './shared/types'

const callOptions = { region: REGION }

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

    const startedAt = Date.now()
    const ref = userRef(uid).collection('sessions').doc()
    const roundNumber = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef(uid))
      const nextRound = (userSnap.get('debateRoundCount') as number | undefined ?? 0) + 1
      const closedAt = Date.now()

      for (const doc of stale.docs) {
        const snap = await tx.get(doc.ref)
        if (snap.get('status') !== 'active') {
          continue
        }
        tx.update(doc.ref, {
          status: 'abandoned',
          outcomeReason: 'abandoned',
          endedAt: closedAt,
        })
        tx.set(
          debateRoundRef(uid, doc.id),
          {
            status: 'abandoned',
            outcomeReason: 'abandoned',
            endedAt: closedAt,
          } satisfies Partial<DebateRoundRecord>,
          { merge: true },
        )
      }

      const session: DebateSession = {
        roundNumber: nextRound,
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
        exchangeCount: 0,
        eventLog: [],
        conductEvents: 0,
        conductPenaltyPoints: 0,
      }
      tx.set(ref, session)
      tx.set(debateRoundRef(uid, ref.id), {
        sessionId: ref.id,
        roundNumber: nextRound,
        topic,
        startedAt,
        endedAt: null,
        status: 'active',
        outcomeReason: null,
      } satisfies DebateRoundRecord)
      tx.update(userRef(uid), { debateRoundCount: nextRound })
      return nextRound
    })

    const sessionForDeadline: DebateSession = {
      roundNumber,
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
      exchangeCount: 0,
    }

    logger.info('Session started', { uid, sessionId: ref.id, topic, debaterSide, roundNumber })

    return {
      sessionId: ref.id,
      roundNumber,
      topic,
      userSide,
      debaterSide,
      startedAt,
      deadline: deadlineFor(sessionForDeadline),
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
      return terminalResponse(session, 0)
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

    const userTurn = cleanUser.length >= 2
    const nextExchange = (session.exchangeCount ?? 0) + (userTurn ? 1 : 0)

    let eventLog = session.eventLog ?? []
    if (cleanUser && looksLikePromptInjection(cleanUser)) {
      eventLog = appendEventLog(eventLog, {
        turn: nextExchange || 1,
        type: 'gaming_attempt',
        source: 'event_log',
        detail: 'prompt injection pattern',
      })
    }
    const instant = detectInstantLossSpeech(cleanUser)
    if (instant) {
      eventLog = appendEventLog(eventLog, {
        turn: nextExchange || 1,
        type: instant === 'hate_speech' ? 'hate_speech' : 'toxicity',
        source: 'event_log',
        detail: 'server transcript match',
      })
      await endSession(uid, sessionId, 'lost', instant, additions, eventLog)
      return { outcome: 'lost', reason: instant, remainingMs: 0 }
    }

    const decision = await db.runTransaction(async (tx) => {
      const ref = sessionRef(uid, sessionId)
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined

      if (!current || current.status !== 'active') {
        return terminalDecision(current)
      }

      const mergedLog =
        eventLog.length > (current.eventLog?.length ?? 0)
          ? eventLog
          : (current.eventLog ?? [])
      const exchangeCount =
        (current.exchangeCount ?? 0) + (userTurn ? 1 : 0)

      const result = decideOutcomeFromEvents(mergedLog)

      const transcript = mergeAndPersistTranscript(
        tx,
        ref,
        current.transcript ?? [],
        additions,
      )

      const update: Record<string, unknown> = {
        transcript,
        exchangeCount,
        eventLog: mergedLog,
        conductEvents: penaltyCountFromLog(mergedLog),
        conductPenaltyPoints: penaltyCountFromLog(mergedLog),
      }

      if (result.outcome !== 'continue') {
        const endedAt = Date.now()
        update.status = result.outcome
        update.outcomeReason = result.reason
        update.endedAt = endedAt
        if (result.outcome === 'needs_work') {
          update.debateVerdict = 'needs_work'
        }
        patchDebateRoundInTx(tx, uid, sessionId, {
          status: result.outcome,
          outcomeReason: result.reason,
          endedAt,
        })
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
    const { sessionId, reason, transcript: clientTranscript } = request.data ?? {}

    await mergeClientTranscript(uid, sessionId, clientTranscript)

    const session = await loadSession(uid, sessionId)

    if (session.results) {
      return { status: session.status, reason: session.outcomeReason, results: session.results }
    }

    let status = session.status
    let outcomeReason: SessionOutcomeReason | null = session.outcomeReason

    let judgeVerdict = session.judgeVerdict ?? null
    const skipJudge =
      session.outcomeReason === 'hate_speech' || session.outcomeReason === 'yelling'

    if (status === 'active') {
      if (reason === 'abandoned') {
        status = 'abandoned'
        outcomeReason = 'abandoned'
      } else if (Date.now() >= deadlineFor(session) - LATE_TURN_GRACE_MS) {
        // Timer expired — fall through to session judge below.
      } else {
        throw new HttpsError(
          'failed-precondition',
          'The debate is still running and has not been decided.',
        )
      }
    }

    if (!skipJudge && !judgeVerdict && status !== 'abandoned') {
      try {
        judgeVerdict = await runSessionJudge({
          topic: session.topic,
          debaterSide: session.debaterSide,
          transcript: session.transcript,
          eventLog: session.eventLog ?? [],
          userArguedOwnPosition: true,
        })
        session.judgeVerdict = judgeVerdict

        if (status === 'active' || status === 'needs_work') {
          const decision = decideOutcomeFromVerdict(judgeVerdict)
          status = decision.outcome === 'continue' ? 'needs_work' : decision.outcome
          outcomeReason = decision.reason
          if (judgeVerdict.session_terminate) {
            status = 'lost'
          }
        }
      } catch (error) {
        logger.error('Session judge failed', error)
        if (status === 'active') {
          status = 'needs_work'
          outcomeReason = 'argument_quality'
        }
      }
    }

    const diagnostic = await loadDiagnostic(uid)
    const takeaways =
      judgeVerdict?.feedback_summary && !skipJudge
        ? [judgeVerdict.feedback_summary]
        : await runTakeaways({
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
      judgeVerdict: skipJudge ? null : judgeVerdict,
    })

    const debateVerdict =
      status === 'passed' ? 'pass' : status === 'needs_work' ? 'needs_work' : session.debateVerdict

    const endedAt = session.endedAt ?? Date.now()
    await sessionRef(uid, sessionId).update({
      status,
      outcomeReason,
      endedAt,
      results,
      ...(judgeVerdict ? { judgeVerdict } : {}),
      ...(debateVerdict ? { debateVerdict } : {}),
    })
    await debateRoundRef(uid, sessionId).set(
      {
        status,
        outcomeReason,
        endedAt,
      } satisfies Partial<DebateRoundRecord>,
      { merge: true },
    )

    logger.info('Session finalized', { uid, sessionId, status, outcomeReason })

    return { status, reason: outcomeReason, results }
  },
)

// ---------------------------------------------------------------------------
// syncTranscript
// ---------------------------------------------------------------------------

/**
 * Merges the client's live transcript buffer into the session document (and
 * per-line subcollection). Safe to call repeatedly — duplicates are skipped.
 */
export const syncTranscript = onCall<SyncTranscriptRequest, Promise<SyncTranscriptResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, entries } = request.data ?? {}
    const length = await mergeClientTranscript(uid, sessionId, entries)
    return { ok: true, length }
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
      transcript?: unknown
    }

    if (!body?.idToken || !body?.sessionId) {
      res.status(400).send('Missing idToken or sessionId')
      return
    }

    const sessionId = body.sessionId
    const decoded = await auth.verifyIdToken(body.idToken)
    try {
      await mergeClientTranscript(decoded.uid, sessionId, body.transcript)
    } catch (error) {
      logger.warn('abandonSession transcript merge skipped', error)
    }

    const ref = sessionRef(decoded.uid, sessionId)

    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined
      if (!current || current.status !== 'active') {
        return
      }
      const endedAt = Date.now()
      tx.update(ref, {
        status: 'abandoned',
        outcomeReason: 'abandoned',
        endedAt,
      })
      tx.set(
        debateRoundRef(decoded.uid, sessionId),
        {
          status: 'abandoned',
          outcomeReason: 'abandoned',
          endedAt,
        } satisfies Partial<DebateRoundRecord>,
        { merge: true },
      )
    })

    res.status(204).send('')
  } catch (error) {
    logger.error('abandonSession failed', error)
    res.status(400).send('Bad request')
  }
})

// ---------------------------------------------------------------------------

export const reportConduct = onCall<ReportConductRequest, Promise<ReportConductResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, kind, turn } = request.data ?? {}
    if (!sessionId || !kind) {
      throw new HttpsError('invalid-argument', 'sessionId and kind are required.')
    }

    const ref = sessionRef(uid, sessionId)
    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined
      if (!current || current.status !== 'active') {
        const log = current?.eventLog
        return {
          outcome: terminalDecision(current).outcome,
          reason: current?.outcomeReason ?? null,
          conductEvents: penaltyCountFromLog(log),
          interruptionCount: interruptionCount(log),
          interruptionsLimit: INTERRUPTIONS_TO_LOSE,
        }
      }

      const turnIndex = Math.max(1, Number(turn) || (current.exchangeCount ?? 1))
      let eventLog = appendEventLog(current.eventLog, {
        turn: turnIndex,
        type: mapConductKindToEventType(kind),
        source: 'event_log',
      })

      if (kind === 'yelling') {
        const endedAt = Date.now()
        tx.update(ref, {
          status: 'lost',
          outcomeReason: 'yelling',
          endedAt,
          eventLog,
          conductEvents: penaltyCountFromLog(eventLog),
          conductPenaltyPoints: penaltyCountFromLog(eventLog),
        })
        patchDebateRoundInTx(tx, uid, sessionId, {
          status: 'lost',
          outcomeReason: 'yelling',
          endedAt,
        })
        return {
          outcome: 'lost' as const,
          reason: 'yelling' as const,
          conductEvents: penaltyCountFromLog(eventLog),
          interruptionCount: interruptionCount(eventLog),
          interruptionsLimit: INTERRUPTIONS_TO_LOSE,
        }
      }

      const decision = decideOutcomeFromEvents(eventLog)
      const penaltyCount = penaltyCountFromLog(eventLog)
      const strikes = interruptionCount(eventLog)

      const update: Record<string, unknown> = {
        eventLog,
        conductEvents: penaltyCount,
        conductPenaltyPoints: penaltyCount,
      }
      if (decision.outcome !== 'continue') {
        const endedAt = Date.now()
        update.status = decision.outcome
        update.outcomeReason = decision.reason
        update.endedAt = endedAt
        if (decision.outcome === 'needs_work') {
          update.debateVerdict = 'needs_work'
        }
        patchDebateRoundInTx(tx, uid, sessionId, {
          status: decision.outcome,
          outcomeReason: decision.reason,
          endedAt,
        })
      }
      tx.update(ref, update)

      return {
        outcome: decision.outcome === 'continue' ? ('continue' as const) : decision.outcome,
        reason: decision.reason,
        conductEvents: penaltyCount,
        interruptionCount: strikes,
        interruptionsLimit: INTERRUPTIONS_TO_LOSE,
      }
    })

    return result
  },
)

async function endSession(
  uid: string,
  sessionId: string,
  status: SessionStatus,
  reason: SessionOutcomeReason,
  additions: TranscriptEntry[],
  eventLog?: EventLogEntry[],
): Promise<void> {
  const ref = sessionRef(uid, sessionId)
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref)
    const current = snapshot.data() as DebateSession | undefined
    if (!current || current.status !== 'active') {
      return
    }
    const log = eventLog ?? current.eventLog
    const transcript = mergeAndPersistTranscript(
      tx,
      ref,
      current.transcript ?? [],
      additions,
    )
    const endedAt = Date.now()
    tx.update(ref, {
      status,
      outcomeReason: reason,
      endedAt,
      transcript,
      ...(log ? { eventLog: log, conductEvents: penaltyCountFromLog(log), conductPenaltyPoints: penaltyCountFromLog(log) } : {}),
    })
    tx.set(
      debateRoundRef(uid, sessionId),
      {
        status,
        outcomeReason: reason,
        endedAt,
      } satisfies Partial<DebateRoundRecord>,
      { merge: true },
    )
  })
}

async function mergeClientTranscript(
  uid: string,
  sessionId: string,
  raw: unknown,
): Promise<number> {
  const incoming = sanitizeTranscriptList(raw)
  if (!incoming.length) {
    const snap = await sessionRef(uid, sessionId).get()
    return (snap.data() as DebateSession | undefined)?.transcript?.length ?? 0
  }

  const ref = sessionRef(uid, sessionId)
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref)
    const current = snapshot.data() as DebateSession | undefined
    if (!current) {
      throw new HttpsError('not-found', 'Session not found.')
    }
    const transcript = mergeAndPersistTranscript(
      tx,
      ref,
      current.transcript ?? [],
      incoming,
    )
    tx.update(ref, { transcript })
    return transcript.length
  })
}

function patchDebateRoundInTx(
  tx: Transaction,
  uid: string,
  sessionId: string,
  patch: Partial<DebateRoundRecord>,
): void {
  tx.set(debateRoundRef(uid, sessionId), patch, { merge: true })
}

function mergeAndPersistTranscript(
  tx: Transaction,
  ref: DocumentReference,
  existing: TranscriptEntry[],
  additions: TranscriptEntry[],
): TranscriptEntry[] {
  const merged = mergeTranscriptAppend(existing, additions)
  const newLines = merged.slice(existing.length)
  for (const entry of newLines) {
    tx.set(ref.collection('transcript').doc(), entry)
  }
  return merged
}

function penaltyCountFromLog(log: EventLogEntry[] | undefined): number {
  if (!log?.length) return 0
  return log.filter((e) =>
    ['interruption', 'long_turn', 'yelling', 'insult', 'dismissiveness'].includes(e.type),
  ).length
}

function terminalDecision(session: DebateSession | undefined): {
  outcome: 'passed' | 'needs_work' | 'lost'
  reason: SessionOutcomeReason | null
} {
  if (!session || session.status === 'active') {
    return { outcome: 'lost', reason: null }
  }
  const status = session.status as string
  if (status === 'passed' || status === 'won') {
    return { outcome: 'passed', reason: session.outcomeReason }
  }
  if (status === 'needs_work') {
    return { outcome: 'needs_work', reason: session.outcomeReason }
  }
  return { outcome: 'lost', reason: session.outcomeReason }
}

function terminalResponse(session: DebateSession, remainingMs: number): SubmitTurnResponse {
  const decision = terminalDecision(session)
  return {
    outcome: decision.outcome,
    reason: decision.reason,
    remainingMs,
  }
}

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
