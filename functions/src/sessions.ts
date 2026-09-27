import type { DocumentReference, Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { REGION } from './config'
import { auth, db, debateRoundRef, sessionRef, userRef } from './firebase'
import { recordHueyWinContribution, loadHueyDailyContext } from './huey'
import { runSessionJudge, runTakeaways, runTextDebaterReply } from './llm'
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
import { transcriptRequestsForceWin } from './shared/judgeVerdict'
import {
  DEBATE_DURATION_MS,
  LATE_TURN_GRACE_MS,
  MAX_PAUSE_CREDIT_MS,
  buildResults,
} from './shared/scoring'
import { applyStreakUpdate } from './shared/streak'
import { getTopic, oppositeSide, sideFromLean, TOPIC_IDS } from './shared/topics'
import { mergeTranscriptAppend, sanitizeTranscriptList } from './shared/transcriptMerge'
import type {
  DebateModality,
  DebateRoundRecord,
  DebateSession,
  DiagnosticResult,
  FinalizeSessionRequest,
  FinalizeSessionResponse,
  EventLogEntry,
  ReplyTextTurnRequest,
  ReplyTextTurnResponse,
  ReportConductRequest,
  ReportConductResponse,
  SessionOutcomeReason,
  SessionStatus,
  Side,
  StartSessionRequest,
  StartSessionResponse,
  SubmitTurnRequest,
  SubmitTurnResponse,
  SyncTranscriptRequest,
  SyncTranscriptResponse,
  TopicId,
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

async function loadDiagnostic(uid: string): Promise<DiagnosticResult | null> {
  const snapshot = await userRef(uid).get()
  const diagnostic = snapshot.get('diagnostic') as DiagnosticResult | undefined
  if (!diagnostic?.assignedTopic) {
    return null
  }
  return diagnostic
}

/** Spectrum results still need a DiagnosticResult when the user skipped the quiz. */
function syntheticDiagnostic(topic: TopicId, userSide: Side): DiagnosticResult {
  const lean = userSide === 'left' ? -0.6 : 0.6
  const topicLeans = {} as Record<TopicId, number>
  const topicExtremity = {} as Record<TopicId, number>
  for (const id of TOPIC_IDS) {
    topicLeans[id] = id === topic ? lean : 0
    topicExtremity[id] = id === topic ? Math.abs(lean) : 0
  }
  return {
    answers: [],
    topicLeans,
    topicExtremity,
    openness: 0.5,
    assignedTopic: topic,
  }
}

function parseExplicitTopicSide(data: unknown): { topicId: TopicId; userSide: Side } | null {
  if (!data || typeof data !== 'object') return null
  const body = data as StartSessionRequest
  if (!body.topicId || !body.userSide) return null
  if (!TOPIC_IDS.includes(body.topicId)) {
    throw new HttpsError('invalid-argument', 'Unknown topicId.')
  }
  if (body.userSide !== 'left' && body.userSide !== 'right') {
    throw new HttpsError('invalid-argument', 'userSide must be left or right.')
  }
  getTopic(body.topicId)
  return { topicId: body.topicId, userSide: body.userSide }
}

function parseModality(data: unknown): DebateModality | undefined {
  if (!data || typeof data !== 'object') return undefined
  const modality = (data as StartSessionRequest).modality
  return modality === 'text' || modality === 'voice' ? modality : undefined
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
export const startSession = onCall<StartSessionRequest, Promise<StartSessionResponse>>(
  { region: REGION },
  async (request) => {
    const uid = requireUid(request)
    const explicit = parseExplicitTopicSide(request.data)
    const modality = parseModality(request.data)

    let topic: TopicId
    let userSide: Side

    if (explicit) {
      topic = explicit.topicId
      userSide = explicit.userSide
    } else {
      const diagnostic = await loadDiagnostic(uid)
      if (!diagnostic) {
        throw new HttpsError(
          'failed-precondition',
          'Pick today’s topic and stance, or complete the diagnostic first.',
        )
      }
      topic = diagnostic.assignedTopic
      const lean = diagnostic.topicLeans?.[topic] ?? 0
      userSide = sideFromLean(lean)
    }

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
        ...(modality ? { modality } : {}),
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

      // Clear stale streaks when the user starts a new debate after missing a day.
      const streakFields = applyStreakUpdate(
        {
          wins: userSnap.get('wins') as number | undefined,
          streak: userSnap.get('streak') as number | undefined,
          lastWinDateKey: userSnap.get('lastWinDateKey') as string | null | undefined,
          longestStreak: userSnap.get('longestStreak') as number | undefined,
        },
        { won: false },
      )
      tx.update(userRef(uid), {
        debateRoundCount: nextRound,
        wins: streakFields.wins,
        streak: streakFields.streak,
        lastWinDateKey: streakFields.lastWinDateKey,
        longestStreak: streakFields.longestStreak,
      })
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

    const huey = await loadHueyDailyContext()

    return {
      sessionId: ref.id,
      roundNumber,
      topic,
      userSide,
      debaterSide,
      startedAt,
      deadline: deadlineFor(sessionForDeadline),
      hueyDailyContext: huey.context,
      hueyContributionCount: huey.count,
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
      } else if (
        Date.now() >= deadlineFor(session) - LATE_TURN_GRACE_MS ||
        // Text debates expose "End and score" before the timer; allow that path.
        session.modality === 'text' ||
        // Client timeout (covers small clock skew vs the hard deadline).
        reason === 'timeout'
      ) {
        // Fall through to session judge below.
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

    // Playtest: user message starting with `/win` forces a pass at session end
    // (unless already hard-stopped for hate speech / yelling).
    if (
      !skipJudge &&
      status !== 'abandoned' &&
      status !== 'lost' &&
      transcriptRequestsForceWin(session.transcript)
    ) {
      status = 'passed'
      outcomeReason = 'passed'
      logger.info('Force-win via /win in transcript', { uid, sessionId })
    }

    const diagnostic =
      (await loadDiagnostic(uid)) ?? syntheticDiagnostic(session.topic, session.userSide)
    let takeaways: string[]
    if (judgeVerdict?.feedback_summary && !skipJudge) {
      takeaways = [judgeVerdict.feedback_summary]
    } else {
      try {
        takeaways = await runTakeaways({
          topic: session.topic,
          debaterSide: session.debaterSide,
          transcript: session.transcript,
          outcome: outcomeDescription(status, outcomeReason),
        })
      } catch (error) {
        logger.error('Takeaways failed', error)
        takeaways = ['Thanks for debating. Detailed feedback was unavailable this round.']
      }
    }

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
    const won = status === 'passed' || (status as string) === 'won'

    await db.runTransaction(async (tx) => {
      // Firestore requires all reads before any writes in a transaction.
      const sRef = sessionRef(uid, sessionId)
      const uRef = userRef(uid)
      const [sSnap, uSnap] = await Promise.all([tx.get(sRef), tx.get(uRef)])
      const existing = sSnap.data() as DebateSession | undefined
      if (existing?.results) {
        // Another finalize won the race; leave session + streak as-is.
        return
      }

      tx.update(sRef, {
        status,
        outcomeReason,
        endedAt,
        results,
        ...(judgeVerdict ? { judgeVerdict } : {}),
        ...(debateVerdict ? { debateVerdict } : {}),
      })
      tx.set(
        debateRoundRef(uid, sessionId),
        {
          status,
          outcomeReason,
          endedAt,
        } satisfies Partial<DebateRoundRecord>,
        { merge: true },
      )

      const prevDebatesWon =
        typeof uSnap.get('debatesWon') === 'number' && Number.isFinite(uSnap.get('debatesWon'))
          ? (uSnap.get('debatesWon') as number)
          : 0
      const streakFields = applyStreakUpdate(
        {
          wins: uSnap.get('wins') as number | undefined,
          streak: uSnap.get('streak') as number | undefined,
          lastWinDateKey: uSnap.get('lastWinDateKey') as string | null | undefined,
          longestStreak: uSnap.get('longestStreak') as number | undefined,
        },
        { won },
      )
      const profilePatch = {
        wins: streakFields.wins,
        streak: streakFields.streak,
        lastWinDateKey: streakFields.lastWinDateKey,
        longestStreak: streakFields.longestStreak,
        ...(won ? { debatesWon: prevDebatesWon + 1 } : {}),
      }
      if (uSnap.exists) {
        tx.update(uRef, profilePatch)
      } else {
        tx.set(uRef, profilePatch, { merge: true })
      }
    })

    logger.info('Session finalized', { uid, sessionId, status, outcomeReason, won })

    if (won) {
      // Fire-and-forget learning — never block the client on sanitize/LLM.
      const wonSession: DebateSession = {
        ...session,
        status,
        outcomeReason,
        results,
        judgeVerdict: judgeVerdict ?? session.judgeVerdict,
        endedAt,
      }
      void recordHueyWinContribution(uid, wonSession).catch((error) => {
        logger.warn('Huey win contribution failed', error)
      })
    }

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

// ---------------------------------------------------------------------------
// replyTextTurn — AI text opponent (non-live)
// ---------------------------------------------------------------------------

/**
 * Judges the user's text turn for instant-loss conduct, appends it, generates
 * an AI rebuttal via the debater system prompt, and returns both.
 */
export const replyTextTurn = onCall<ReplyTextTurnRequest, Promise<ReplyTextTurnResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const { sessionId, userText } = request.data ?? {}

    const session = await loadSession(uid, sessionId)
    if (session.status !== 'active') {
      return {
        ...terminalResponse(session, 0),
        aiText: null,
        exchangeCount: session.exchangeCount ?? 0,
      }
    }

    const now = Date.now()
    const deadline = deadlineFor(session)
    const cleanUser = sanitizeSpeech(userText)

    if (!cleanUser) {
      throw new HttpsError('invalid-argument', 'userText is required.')
    }

    const wordCount = cleanUser.split(/\s+/).filter(Boolean).length
    if (wordCount > 20) {
      throw new HttpsError(
        'invalid-argument',
        `Messages are limited to 20 words (got ${wordCount}).`,
      )
    }

    if (now > deadline + LATE_TURN_GRACE_MS) {
      await endSession(uid, sessionId, 'lost', 'timeout', [
        { speaker: 'user', text: cleanUser, ts: now },
      ])
      return {
        outcome: 'lost',
        reason: 'timeout',
        remainingMs: 0,
        aiText: null,
        exchangeCount: session.exchangeCount ?? 0,
      }
    }

    const nextExchange = (session.exchangeCount ?? 0) + 1
    let eventLog = session.eventLog ?? []

    if (looksLikePromptInjection(cleanUser)) {
      eventLog = appendEventLog(eventLog, {
        turn: nextExchange,
        type: 'gaming_attempt',
        source: 'event_log',
        detail: 'prompt injection pattern',
      })
    }

    const instant = detectInstantLossSpeech(cleanUser)
    if (instant) {
      eventLog = appendEventLog(eventLog, {
        turn: nextExchange,
        type: instant === 'hate_speech' ? 'hate_speech' : 'toxicity',
        source: 'event_log',
        detail: 'server transcript match',
      })
      await endSession(
        uid,
        sessionId,
        'lost',
        instant,
        [{ speaker: 'user', text: cleanUser, ts: now }],
        eventLog,
      )
      return {
        outcome: 'lost',
        reason: instant,
        remainingMs: 0,
        aiText: null,
        exchangeCount: nextExchange,
      }
    }

    const eventDecision = decideOutcomeFromEvents(eventLog)
    if (eventDecision.outcome !== 'continue') {
      await endSession(
        uid,
        sessionId,
        eventDecision.outcome,
        eventDecision.reason ?? 'incivility',
        [{ speaker: 'user', text: cleanUser, ts: now }],
        eventLog,
      )
      return {
        outcome: eventDecision.outcome,
        reason: eventDecision.reason,
        remainingMs: Math.max(0, deadline - Date.now()),
        aiText: null,
        exchangeCount: nextExchange,
      }
    }

    let aiText = ''
    try {
      const huey = await loadHueyDailyContext()
      aiText = await runTextDebaterReply({
        topic: session.topic,
        debaterSide: session.debaterSide,
        transcript: [
          ...(session.transcript ?? []),
          { speaker: 'user', text: cleanUser, ts: now },
        ],
        hueyDailyContext: huey.context,
      })
    } catch (error) {
      logger.error('Text debater reply failed', error)
      throw new HttpsError('internal', 'Could not generate a reply. Try again.')
    }

    const cleanAi = sanitizeSpeech(aiText)
    const additions: TranscriptEntry[] = [
      { speaker: 'user', text: cleanUser, ts: now },
    ]
    if (cleanAi) {
      additions.push({ speaker: 'ai', text: cleanAi, ts: Date.now() })
    }

    await db.runTransaction(async (tx) => {
      const ref = sessionRef(uid, sessionId)
      const snapshot = await tx.get(ref)
      const current = snapshot.data() as DebateSession | undefined
      if (!current || current.status !== 'active') {
        return
      }
      const transcript = mergeAndPersistTranscript(
        tx,
        ref,
        current.transcript ?? [],
        additions,
      )
      tx.update(ref, {
        transcript,
        exchangeCount: nextExchange,
        eventLog,
        conductEvents: penaltyCountFromLog(eventLog),
        conductPenaltyPoints: penaltyCountFromLog(eventLog),
      })
    })

    return {
      outcome: 'continue',
      reason: null,
      remainingMs: Math.max(0, deadline - Date.now()),
      aiText: cleanAi || null,
      exchangeCount: nextExchange,
    }
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
