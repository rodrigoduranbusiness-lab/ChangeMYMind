import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import {
  INTERRUPTION_REPORT_COOLDOWN_MS,
  INTERRUPTIONS_TO_LOSE,
  USER_MAX_SPEECH_MS,
} from '@shared/conduct'
import { DEBATE_DURATION_MS } from '@shared/scoring'
import { normalizeSessionStatus } from '@shared/rules'
import { getTopic } from '@shared/topics'
import type { SessionOutcomeReason, SessionStatus, TranscriptEntry } from '@shared/types'
import { useAuth } from '../auth/context'
import { DebateChrome } from '../components/DebateChrome'
import { SiteShareMark } from '../components/SiteBrand'
import SpeakingIndicator from '../components/SpeakingIndicator'
import {
  abandonSessionOnUnload,
  cacheIdToken,
  cacheTranscriptForUnload,
  finalizeSession,
  prefetchLiveAccess,
  reportConduct,
  reportPause,
  startSession,
  submitTurn,
  syncTranscript,
} from '../lib/api'
import { DebateController } from '../lib/liveDebate'
import type { SpeakerState } from '../lib/liveDebate'
import * as s from '../theme'

type Phase =
  | 'intro'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'micDenied'
  | 'failed'
  | 'finished'

type DebateVerdict = 'passed' | 'needs_work' | 'lost'

interface Outcome {
  verdict: DebateVerdict
  reason: SessionOutcomeReason | null
  headlineDetail?: string
}

function verdictFromStatus(status: SessionStatus | 'won'): DebateVerdict {
  const normalized = normalizeSessionStatus(status)
  if (normalized === 'passed') return 'passed'
  if (normalized === 'needs_work') return 'needs_work'
  return 'lost'
}

const CONFIRM_MS = 120
const WHITEOUT_MS = 180

export default function Debate() {
  const { diagnostic } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('intro')
  const [speaker, setSpeaker] = useState<SpeakerState>('idle')
  const [remainingMs, setRemainingMs] = useState(DEBATE_DURATION_MS)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [conductNotice, setConductNotice] = useState<string | null>(null)
  const [interruptionStrikes, setInterruptionStrikes] = useState(0)
  const [userTurnSpeech, setUserTurnSpeech] = useState<{
    elapsedMs: number
    maxMs: number
  } | null>(null)
  const [turnHintVisible, setTurnHintVisible] = useState(false)
  const [turnHintProgress, setTurnHintProgress] = useState<{
    elapsedMs: number
    maxMs: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Mirrors sessionIdRef for rendering; the ref is for callbacks and unload. */
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [beginConfirmed, setBeginConfirmed] = useState(false)
  const [whiteout, setWhiteout] = useState(false)
  const [whiteOpaque, setWhiteOpaque] = useState(false)

  const controllerRef = useRef<DebateController | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const deadlineRef = useRef<number>(0)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const pauseStartedAtRef = useRef<number | null>(null)
  const reconnectUsedRef = useRef(false)
  const endedRef = useRef(false)
  /** Serializes judge calls so turns are never scored out of order. */
  const turnChainRef = useRef<Promise<void>>(Promise.resolve())
  const exchangeCountRef = useRef(0)
  const lastInterruptionReportRef = useRef(0)

  useEffect(() => {
    if (userTurnSpeech) {
      setTurnHintVisible(true)
      setTurnHintProgress(userTurnSpeech)
      return
    }
    const hide = window.setTimeout(() => {
      setTurnHintVisible(false)
      setTurnHintProgress(null)
    }, 700)
    return () => window.clearTimeout(hide)
  }, [userTurnSpeech])
  const beginTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  const topicId = diagnostic?.assignedTopic
  const topic = topicId ? getTopic(topicId) : null

  useEffect(() => {
    return () => {
      for (const id of beginTimers.current) clearTimeout(id)
    }
  }, [])

  // Warm the Live token while they read the allow-mic screen.
  useEffect(() => {
    if (phase !== 'intro' && phase !== 'connecting') return
    prefetchLiveAccess()
  }, [phase])

  function scheduleBegin(ms: number, next: () => void) {
    const id = setTimeout(next, ms)
    beginTimers.current.push(id)
  }

  function clearWhiteout() {
    setWhiteOpaque(false)
    scheduleBegin(WHITEOUT_MS, () => setWhiteout(false))
  }

  // --- ending -------------------------------------------------------------

  async function persistTranscriptBuffer() {
    const id = sessionIdRef.current
    if (!id || !transcriptRef.current.length) {
      return
    }
    await turnChainRef.current.catch(() => {})
    try {
      await syncTranscript(id, transcriptRef.current)
    } catch (caught) {
      console.error('syncTranscript failed', caught)
    }
  }

  /** Cuts the audio immediately and hard-switches to the result screen. */
  const endDebate = useCallback(async (result: Outcome) => {
    if (endedRef.current) return
    endedRef.current = true

    controllerRef.current?.cutAudio()
    await controllerRef.current?.stop()
    controllerRef.current = null

    await persistTranscriptBuffer()

    const id = sessionIdRef.current
    if (id) {
      try {
        await finalizeSession(id, undefined, transcriptRef.current)
      } catch (caught) {
        console.error('finalize on end failed', caught)
      }
    }

    setOutcome(result)
    setPhase('finished')
  }, [])

  /**
   * Tears down a debate we cannot continue and closes it out server-side, so
   * the results screen still has something to show instead of a dead session.
   */
  const failDebate = useCallback(async (message: string) => {
    endedRef.current = true

    controllerRef.current?.cutAudio()
    await controllerRef.current?.stop()
    controllerRef.current = null

    setError(message)
    setPhase('failed')

    const id = sessionIdRef.current
    if (id) {
      try {
        await turnChainRef.current.catch(() => {})
        const transcript = transcriptRef.current
        if (transcript.length) {
          try {
            await syncTranscript(id, transcript)
          } catch (syncError) {
            console.error('syncTranscript on fail failed', syncError)
          }
        }
        await finalizeSession(id, 'abandoned', transcript)
      } catch (caught) {
        console.error('Could not close out the session', caught)
      }
    }
  }, [])

  /**
   * On timer expiry the server has the final say — a win that crossed the
   * threshold on the last turn still counts even if that response was lost.
   */
  const endOnTimeout = useCallback(async () => {
    if (endedRef.current) return
    const sessionId = sessionIdRef.current

    controllerRef.current?.cutAudio()

    if (!sessionId) {
      await endDebate({ verdict: 'lost', reason: 'timeout' })
      return
    }

    try {
      await turnChainRef.current.catch(() => {})
      const transcript = transcriptRef.current
      if (transcript.length) {
        try {
          await syncTranscript(sessionId, transcript)
        } catch (syncError) {
          console.error('syncTranscript on timeout failed', syncError)
        }
      }
      const result = await finalizeSession(sessionId, undefined, transcript)
      await endDebate({ verdict: verdictFromStatus(result.status), reason: result.reason })
    } catch (caught) {
      console.error('Finalize on timeout failed', caught)
      await endDebate({ verdict: 'lost', reason: 'timeout' })
    }
  }, [endDebate])

  // --- countdown ----------------------------------------------------------

  useEffect(() => {
    if (phase !== 'live') return

    const tick = () => {
      const left = Math.max(0, deadlineRef.current - Date.now())
      setRemainingMs(left)
      if (left <= 0) {
        void endOnTimeout()
      }
    }

    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [phase, endOnTimeout])

  // --- tab close ----------------------------------------------------------

  useEffect(() => {
    const onLeave = () => {
      if (endedRef.current) return
      const sessionId = sessionIdRef.current
      if (sessionId) {
        abandonSessionOnUnload(sessionId)
      }
    }

    window.addEventListener('pagehide', onLeave)
    return () => window.removeEventListener('pagehide', onLeave)
  }, [])

  // Stop the mic and socket if the user navigates away mid-debate.
  useEffect(() => {
    return () => {
      void controllerRef.current?.stop()
      controllerRef.current = null
    }
  }, [])

  // --- turn handling ------------------------------------------------------

  const handleTurn = useCallback(
    (turn: { userText: string; aiText: string }) => {
      const now = Date.now()
      if (turn.userText) {
        exchangeCountRef.current += 1
        transcriptRef.current.push({ speaker: 'user', text: turn.userText, ts: now })
      }
      if (turn.aiText) {
        transcriptRef.current.push({ speaker: 'ai', text: turn.aiText, ts: now })
      }
      cacheTranscriptForUnload(transcriptRef.current)

      const sessionId = sessionIdRef.current
      if (!sessionId) return

      turnChainRef.current = turnChainRef.current
        .then(async () => {
          if (endedRef.current) return

          const response = await submitTurn(sessionId, turn.userText, turn.aiText)
          if (response.outcome === 'continue') {
            return
          }
          await endDebate({ verdict: response.outcome, reason: response.reason })
        })
        .catch((caught) => {
          // A dropped judge call must not end the debate.
          console.error('submitTurn failed', caught)
        })
    },
    [endDebate],
  )

  const instantViolationHandledRef = useRef(false)

  const handleInstantSpeechViolation = useCallback(
    (reason: 'hate_speech' | 'incivility', userText: string) => {
      const sessionId = sessionIdRef.current
      if (!sessionId || endedRef.current || instantViolationHandledRef.current || !userText.trim()) {
        return
      }
      instantViolationHandledRef.current = true
      controllerRef.current?.cutAudio()
      void (async () => {
        try {
          const response = await submitTurn(sessionId, userText, '')
          if (response.outcome !== 'continue') {
            await endDebate({ verdict: 'lost', reason: response.reason ?? reason })
            return
          }
        } catch (caught) {
          console.error('instant speech violation submitTurn failed', caught)
        }
        await endDebate({ verdict: 'lost', reason })
      })()
    },
    [endDebate],
  )

  const handleConduct = useCallback(
    (kind: 'interruption' | 'long_turn' | 'yelling') => {
      const sessionId = sessionIdRef.current
      if (!sessionId || endedRef.current) return

      if (kind === 'interruption' || kind === 'long_turn') {
        const now = Date.now()
        if (now - lastInterruptionReportRef.current < INTERRUPTION_REPORT_COOLDOWN_MS) {
          return
        }
        lastInterruptionReportRef.current = now
      }

      void (async () => {
        try {
          const response = await reportConduct(sessionId, kind, exchangeCountRef.current || 1)
          const { interruptionCount: count, interruptionsLimit: limit } = response

          if (response.outcome === 'continue') {
            if (kind === 'interruption' || kind === 'long_turn') {
              setInterruptionStrikes(count)
            }
            return
          }

          if (response.reason === 'interruptions') {
            const detail = `${count} of ${limit} interruptions.`
            setInterruptionStrikes(count)
            setConductNotice(detail)
            await new Promise((resolve) => window.setTimeout(resolve, 2400))
            await endDebate({
              verdict: 'lost',
              reason: 'interruptions',
              headlineDetail: detail,
            })
            return
          }

          if (response.reason === 'yelling') {
            await endDebate({ verdict: 'lost', reason: 'yelling' })
            return
          }

          const verdict =
            response.outcome === 'passed'
              ? 'passed'
              : response.outcome === 'needs_work'
                ? 'needs_work'
                : 'lost'
          await endDebate({ verdict, reason: response.reason })
        } catch (caught) {
          console.error('reportConduct failed', caught)
        }
      })()
    },
    [endDebate],
  )

  // --- connection loss ----------------------------------------------------

  const handleConnectionLost = useCallback(() => {
    if (endedRef.current) return

    // The clock stops while we are disconnected, then we buy that time back
    // from the server so the user is not charged for our outage.
    pauseStartedAtRef.current = Date.now()
    setPhase('reconnecting')

    // Exactly one reconnect attempt, per spec.
    if (reconnectUsedRef.current) {
      void failDebate('The connection to the debate dropped and could not be restored.')
      return
    }
    reconnectUsedRef.current = true

    void (async () => {
      try {
        await controllerRef.current?.reconnect(transcriptRef.current)

        const pausedFor = Date.now() - (pauseStartedAtRef.current ?? Date.now())
        pauseStartedAtRef.current = null

        const id = sessionIdRef.current
        if (id && pausedFor > 500) {
          deadlineRef.current = await reportPause(id, pausedFor)
        }

        setPhase('live')
      } catch (caught) {
        console.error('Reconnect failed', caught)
        await failDebate('The connection to the debate dropped and could not be restored.')
      }
    })()
  }, [failDebate])

  // --- start --------------------------------------------------------------

  async function begin() {
    if (!topicId) return
    setError(null)

    // Ask for the mic before the server starts the clock, so a permission
    // prompt never eats into the debate clock.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      probe.getTracks().forEach((track) => track.stop())
    } catch (caught) {
      console.error('Microphone unavailable', caught)
      clearWhiteout()
      setBeginConfirmed(false)
      setPhase('micDenied')
      return
    }

    setPhase('connecting')

    try {
      await cacheIdToken()

      const session = await startSession()
      sessionIdRef.current = session.sessionId
      setSessionId(session.sessionId)
      deadlineRef.current = session.deadline
      setRemainingMs(Math.max(0, session.deadline - Date.now()))

      const controller = new DebateController({
        topic: session.topic,
        debaterSide: session.debaterSide,
        handlers: {
          onSpeakerChange: setSpeaker,
          onTurnComplete: handleTurn,
          onInterruption: () => handleConduct('interruption'),
          onLongTurn: () => handleConduct('long_turn'),
          onUserTurnSpeech: setUserTurnSpeech,
          onYelling: () => handleConduct('yelling'),
          onInstantSpeechViolation: handleInstantSpeechViolation,
          onConnectionLost: handleConnectionLost,
        },
      })
      controllerRef.current = controller

      await controller.start()
      setPhase('live')
      clearWhiteout()
    } catch (caught) {
      console.error('Failed to start the debate', caught)
      clearWhiteout()
      setBeginConfirmed(false)
      await failDebate(describeStartError(caught))
    }
  }

  function onBeginClick() {
    if (beginConfirmed || phase !== 'intro') return
    setBeginConfirmed(true)

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduceMotion) {
      void begin()
      return
    }

    scheduleBegin(CONFIRM_MS, () => {
      setWhiteout(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setWhiteOpaque(true))
      })
      scheduleBegin(WHITEOUT_MS, () => {
        void begin()
      })
    })
  }

  // --- render -------------------------------------------------------------

  if (!topic || !topicId) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>Take the questions first</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>
            We need your answers before we know which debate to give you.
          </p>
          <div style={{ marginTop: 20 }}>
            <button type="button" onClick={() => navigate('/diagnostic')} style={s.buttonPrimary}>
              Start the questions
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Land on the full results page immediately — no intermediate "See your results" gate.
  if (phase === 'finished' && outcome) {
    return <Navigate to={sessionId ? `/results/${sessionId}` : '/'} replace />
  }

  if (phase === 'micDenied') {
    return (
      <DebateChrome>
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>We need your microphone</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>
            This is a spoken debate, so there is no way to run it without mic access. Allow the
            microphone in your browser's address bar, then try again.
          </p>
          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              onClick={() => {
                setBeginConfirmed(false)
                setPhase('intro')
              }}
              style={s.buttonPrimary}
            >
              Try again
            </button>
          </div>
        </div>
        {whiteout && (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              background: '#ffffff',
              opacity: whiteOpaque ? 1 : 0,
              transition: `opacity ${WHITEOUT_MS}ms ease`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      </DebateChrome>
    )
  }

  if (phase === 'failed') {
    return (
      <DebateChrome>
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>The debate stopped</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>{error}</p>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessionId && (
              <button
                type="button"
                onClick={() => navigate(`/results/${sessionId}`)}
                style={s.buttonPrimary}
              >
                See how far you got
              </button>
            )}
            <button type="button" onClick={() => navigate('/')} style={s.buttonSecondary}>
              Back to the start
            </button>
          </div>
        </div>
        {whiteout && (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              background: '#ffffff',
              opacity: whiteOpaque ? 1 : 0,
              transition: `opacity ${WHITEOUT_MS}ms ease`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      </DebateChrome>
    )
  }

  if (phase === 'intro' || phase === 'connecting') {
    return (
      <DebateChrome>
      <div style={s.page}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
            padding: '0 24px',
            boxSizing: 'border-box',
            opacity: whiteOpaque ? 0 : 1,
            transition: whiteout ? `opacity ${WHITEOUT_MS}ms ease` : undefined,
          }}
        >
          {topic && (
            <>
              <p
                style={{
                  ...s.subheading,
                  marginBottom: 14,
                  color: s.color.textMuted,
                  fontSize: 22,
                  lineHeight: 1.4,
                  maxWidth: '100%',
                }}
              >
                {topic.question}
              </p>
              <div style={{ marginBottom: 20 }}>
                <SiteShareMark size="hero" color={s.color.text} />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onBeginClick}
            disabled={beginConfirmed || phase === 'connecting'}
            style={{
              ...s.disabled(s.buttonPrimary, beginConfirmed || phase === 'connecting'),
              minHeight: 48,
              fontSize: 16,
            }}
          >
            {phase === 'connecting'
              ? 'Connecting…'
              : beginConfirmed
                ? 'Allowed'
                : 'Allow mic access and start'}
          </button>
          <p style={{ ...s.subheading, fontSize: 13, marginTop: 14, color: s.color.textFaint }}>
            We do not stand for or endorse any of the opinions presented.
          </p>
        </div>

        {whiteout && (
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              background: '#ffffff',
              opacity: whiteOpaque ? 1 : 0,
              transition: `opacity ${WHITEOUT_MS}ms ease`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      </DebateChrome>
    )
  }

  const paused = phase === 'reconnecting'
  const turnMaxMs = turnHintProgress?.maxMs ?? USER_MAX_SPEECH_MS
  const turnElapsedMs = turnHintProgress?.elapsedMs ?? 0
  const turnRemainingMs = Math.max(0, turnMaxMs - turnElapsedMs)
  const turnRemainingSec = Math.max(0, Math.ceil(turnRemainingMs / 1000))
  const turnUrgent = turnRemainingMs > 0 && turnRemainingMs <= 10_000 && turnHintVisible
  const showAiWait = !paused && speaker === 'ai' && !turnHintVisible

  return (
    <DebateChrome>
    <div
      style={{
        ...s.page,
        justifyContent: 'flex-start',
        paddingTop: `max(28px, env(safe-area-inset-top))`,
        paddingBottom: `max(40px, env(safe-area-inset-bottom))`,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          textAlign: 'center',
          flex: '0 0 auto',
        }}
      >
        <p
          style={{
            margin: 0,
            padding: '0 12px',
            fontFamily: s.font.serif,
            fontSize: 22,
            lineHeight: 1.35,
            color: s.color.text,
            maxWidth: '100%',
            boxSizing: 'border-box',
            opacity: paused ? 0.35 : 1,
          }}
        >
          {topic?.question}
        </p>
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            opacity: paused ? 0.35 : 1,
          }}
        >
          <SiteShareMark size="debate" color={s.color.text} />
        </div>
        <div
          style={{
            fontFamily: s.font.mono,
            fontSize: 'clamp(40px, 11vw, 64px)',
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '0.06em',
            fontVariantNumeric: 'tabular-nums',
            color: s.color.text,
            opacity: paused ? 0.35 : 1,
          }}
        >
          {formatClock(remainingMs)}
        </div>
        {conductNotice && !paused && (
          <p
            style={{
              margin: '14px 0 0',
              padding: '10px 14px',
              fontFamily: s.font.serif,
              fontSize: 15,
              lineHeight: 1.4,
              color: s.color.text,
              background: s.color.panelRaised,
              border: `1px solid ${s.color.border}`,
            }}
          >
            {conductNotice}
          </p>
        )}
      </div>

      {interruptionStrikes > 0 && phase === 'live' && !paused && (
        <div
          style={{
            position: 'fixed',
            left: `max(12px, env(safe-area-inset-left))`,
            bottom: `max(18px, env(safe-area-inset-bottom))`,
            zIndex: 12,
            fontFamily: s.font.mono,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            color: s.color.textMuted,
            pointerEvents: 'none',
          }}
        >
          {interruptionStrikes} of {INTERRUPTIONS_TO_LOSE} interruptions
        </div>
      )}

      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          gap: 20,
        }}
      >
        <SpeakingIndicator speaker={paused ? 'idle' : speaker} />
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 340,
            minHeight: 76,
            padding: '0 12px',
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 0,
              margin: 0,
              textAlign: 'center',
              fontFamily: s.font.serif,
              fontSize: 16,
              lineHeight: 1.45,
              color: s.color.textMuted,
              opacity: showAiWait ? 1 : 0,
              transition: 'opacity 400ms ease',
            }}
          >
            Wait for the AI to finish before you answer.
          </p>
          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: 0,
              opacity: turnHintVisible ? 1 : 0,
              transition: 'opacity 400ms ease',
              pointerEvents: turnHintVisible ? 'auto' : 'none',
            }}
          >
            <p
              style={{
                margin: 0,
                textAlign: 'center',
                fontFamily: s.font.serif,
                fontSize: 16,
                lineHeight: 1.45,
                color: turnUrgent ? s.color.text : s.color.textMuted,
              }}
            >
              {turnUrgent
                ? `Stop for a reply — ${turnRemainingSec}s left`
                : `Up to 30 seconds per turn, then stop`}
            </p>
            <div
              style={{
                marginTop: 12,
                height: 3,
                width: '100%',
                background: s.color.border,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, (turnElapsedMs / turnMaxMs) * 100)}%`,
                  background: turnUrgent ? s.color.danger : s.color.textMuted,
                  transition: 'width 450ms linear',
                }}
              />
            </div>
            <p
              style={{
                margin: '10px 0 0',
                textAlign: 'center',
                fontFamily: s.font.mono,
                fontSize: 15,
                fontVariantNumeric: 'tabular-nums',
                color: s.color.textFaint,
              }}
            >
              {turnRemainingSec}s
            </p>
          </div>
        </div>
      </div>

      {paused && (
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            fontSize: 14,
            color: s.color.textMuted,
            flex: '0 0 auto',
          }}
        >
          Connection lost — reconnecting. The clock is paused.
        </div>
      )}

      {whiteout && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: '#ffffff',
            opacity: whiteOpaque ? 1 : 0,
            transition: `opacity ${WHITEOUT_MS}ms ease`,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
    </DebateChrome>
  )
}

function describeStartError(caught: unknown): string {
  const code = (caught as { code?: string })?.code ?? ''
  const message = caught instanceof Error ? caught.message : ''

  if (code === 'functions/not-found' || /not found/i.test(message)) {
    return 'The debate server is not available yet. Try again in a moment.'
  }
  if (code === 'functions/failed-precondition') {
    return message || 'Finish the questions before starting a debate.'
  }
  if (code === 'functions/unauthenticated') {
    return 'You need to be signed in to start a debate.'
  }
  if (code === 'functions/internal' || /^internal/i.test(message)) {
    return 'Something went wrong starting the debate. Please try again.'
  }
  if (message.trim()) return message
  return 'We could not start the debate. Please try again.'
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
