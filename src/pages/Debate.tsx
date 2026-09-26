import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { DEBATE_DURATION_MS } from '@shared/scoring'
import { getTopic, sideLabel } from '@shared/topics'
import type { SessionOutcomeReason, Side, TranscriptEntry } from '@shared/types'
import { useAuth } from '../auth/context'
import SpeakingIndicator from '../components/SpeakingIndicator'
import {
  abandonSessionOnUnload,
  cacheIdToken,
  finalizeSession,
  reportPause,
  startSession,
  submitTurn,
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

interface Outcome {
  won: boolean
  reason: SessionOutcomeReason | null
}

export default function Debate() {
  const { diagnostic } = useAuth()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('intro')
  const [speaker, setSpeaker] = useState<SpeakerState>('idle')
  const [remainingMs, setRemainingMs] = useState(DEBATE_DURATION_MS)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Mirrors sessionIdRef for rendering; the ref is for callbacks and unload. */
  const [sessionId, setSessionId] = useState<string | null>(null)

  const controllerRef = useRef<DebateController | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const deadlineRef = useRef<number>(0)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const pauseStartedAtRef = useRef<number | null>(null)
  const reconnectUsedRef = useRef(false)
  const endedRef = useRef(false)
  /** Serializes judge calls so turns are never scored out of order. */
  const turnChainRef = useRef<Promise<void>>(Promise.resolve())

  const topicId = diagnostic?.assignedTopic
  const topic = topicId ? getTopic(topicId) : null
  const userLean = topicId ? (diagnostic?.topicLeans?.[topicId] ?? 0) : 0
  /**
   * Preview of the side the AI will take. The server is the authority here; it
   * agrees with this whenever the user actually leans one way. A lean of
   * exactly zero is a server-side coin flip, so we do not name a side.
   */
  const debaterSide: Side = userLean > 0 ? 'left' : 'right'
  const leanIsKnown = userLean !== 0

  // --- ending -------------------------------------------------------------

  /** Cuts the audio immediately and hard-switches to the result screen. */
  const endDebate = useCallback(async (result: Outcome) => {
    if (endedRef.current) return
    endedRef.current = true

    controllerRef.current?.cutAudio()
    await controllerRef.current?.stop()
    controllerRef.current = null

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
        await finalizeSession(id, 'abandoned')
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
      await endDebate({ won: false, reason: 'timeout' })
      return
    }

    try {
      const result = await finalizeSession(sessionId)
      await endDebate({ won: result.status === 'won', reason: result.reason })
    } catch (caught) {
      console.error('Finalize on timeout failed', caught)
      await endDebate({ won: false, reason: 'timeout' })
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
        transcriptRef.current.push({ speaker: 'user', text: turn.userText, ts: now })
      }
      if (turn.aiText) {
        transcriptRef.current.push({ speaker: 'ai', text: turn.aiText, ts: now })
      }

      const sessionId = sessionIdRef.current
      if (!sessionId) return

      turnChainRef.current = turnChainRef.current
        .then(async () => {
          if (endedRef.current) return

          const response = await submitTurn(sessionId, turn.userText, turn.aiText)
          if (response.outcome === 'continue') {
            return
          }
          await endDebate({ won: response.outcome === 'won', reason: response.reason })
        })
        .catch((caught) => {
          // A dropped judge call must not end the debate.
          console.error('submitTurn failed', caught)
        })
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
    // prompt never eats into the six minutes.
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      probe.getTracks().forEach((track) => track.stop())
    } catch (caught) {
      console.error('Microphone unavailable', caught)
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
          onConnectionLost: handleConnectionLost,
        },
      })
      controllerRef.current = controller

      await controller.start()
      setPhase('live')
    } catch (caught) {
      console.error('Failed to start the debate', caught)
      await failDebate(
        caught instanceof Error
          ? caught.message
          : 'We could not start the debate. Please try again.',
      )
    }
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

  if (phase === 'finished' && outcome) {
    return (
      <ResultScreen
        outcome={outcome}
        onContinue={() => navigate(sessionId ? `/results/${sessionId}` : '/')}
      />
    )
  }

  if (phase === 'micDenied') {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>We need your microphone</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>
            This is a spoken debate, so there is no way to run it without mic access. Allow the
            microphone in your browser's address bar, then try again.
          </p>
          <div style={{ marginTop: 20 }}>
            <button type="button" onClick={() => setPhase('intro')} style={s.buttonPrimary}>
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
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
      </div>
    )
  }

  if (phase === 'intro' || phase === 'connecting') {
    return (
      <div style={s.page}>
        <div style={{ ...s.card, maxWidth: 560 }}>
          <span style={s.label}>Your topic</span>
          <h1 style={{ ...s.heading, fontSize: 30 }}>{topic.label}</h1>
          <p style={{ ...s.subheading, marginTop: 14, fontSize: 17, color: s.color.text }}>
            The AI will argue against you. Change its mind in 6 minutes.
          </p>

          <div style={{ ...s.noteBox, marginTop: 22 }}>
            {leanIsKnown ? (
              <>
                <div style={{ marginBottom: 10 }}>
                  You picked this topic by holding the strongest view on it. The AI will argue the{' '}
                  <strong style={{ color: s.color.text }}>{sideLabel(debaterSide)}</strong> side:
                </div>
                <div style={{ color: s.color.text, lineHeight: 1.6 }}>
                  {topic.positions[debaterSide]}
                </div>
              </>
            ) : (
              <div style={{ lineHeight: 1.6 }}>
                Your answers came out balanced on every topic, so we picked one for you. The AI
                will take a side and argue it hard — you will hear which one in its opening.
              </div>
            )}
          </div>

          <ul
            style={{
              margin: '20px 0 0',
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 14,
              lineHeight: 1.5,
              color: s.color.textMuted,
            }}
          >
            <li>Speak normally — you can interrupt it, and it will stop.</li>
            <li>It will not budge unless you give it a real reason to.</li>
            <li>You will see the clock and nothing else until the debate ends.</li>
          </ul>

          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={begin}
              disabled={phase === 'connecting'}
              style={s.disabled(s.buttonPrimary, phase === 'connecting')}
            >
              {phase === 'connecting' ? 'Connecting…' : 'Allow microphone and begin'}
            </button>
          </div>

          <p style={{ ...s.subheading, fontSize: 12, marginTop: 14, color: s.color.textFaint }}>
            The clock starts once the AI is connected, not when you grant the microphone.
          </p>
        </div>
      </div>
    )
  }

  const paused = phase === 'reconnecting'

  return (
    <div style={{ ...s.page, justifyContent: 'space-between', maxWidth: 620, margin: '0 auto' }}>
      <div style={{ width: '100%', textAlign: 'center', paddingTop: 8 }}>
        <div style={{ ...s.label, marginBottom: 6 }}>{topic.label}</div>
        <div
          style={{
            fontFamily: s.font.mono,
            fontSize: 54,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            color: remainingMs <= 30_000 ? s.color.accent : s.color.text,
            opacity: paused ? 0.4 : 1,
          }}
        >
          {formatClock(remainingMs)}
        </div>
      </div>

      <div style={{ width: '100%' }}>
        <SpeakingIndicator speaker={paused ? 'idle' : speaker} />
      </div>

      <div style={{ width: '100%', textAlign: 'center', minHeight: 48 }}>
        {paused ? (
          <div style={{ fontSize: 14, color: s.color.accent }}>
            Connection lost — reconnecting. The clock is paused.
          </div>
        ) : (
          <div style={{ fontSize: 13, color: s.color.textFaint }}>
            Make your case out loud. Nothing is scored on screen.
          </div>
        )}
      </div>
    </div>
  )
}

/** Full-screen, instant. No gradual reveal and no score. */
function ResultScreen({ outcome, onContinue }: { outcome: Outcome; onContinue: () => void }) {
  const won = outcome.won

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        background: won ? 'rgba(63, 185, 80, 0.07)' : 'rgba(212, 84, 74, 0.07)',
        animation: 'cg-snap-in 140ms ease-out',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(48px, 14vw, 112px)',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: won ? s.color.win : s.color.lose,
        }}
      >
        {won ? 'YOU WIN' : 'YOU LOSE'}
      </div>

      <p
        style={{
          margin: 0,
          maxWidth: 420,
          textAlign: 'center',
          fontSize: 16,
          lineHeight: 1.55,
          color: s.color.textMuted,
        }}
      >
        {describeOutcome(outcome)}
      </p>

      <div style={{ width: '100%', maxWidth: 280 }}>
        <button type="button" onClick={onContinue} style={s.buttonPrimary}>
          See my results
        </button>
      </div>
    </div>
  )
}

function describeOutcome(outcome: Outcome): string {
  if (outcome.won) {
    return 'You moved the AI off its position. That is genuinely hard to do.'
  }
  switch (outcome.reason) {
    case 'incivility':
      return 'The debate ended early because the conversation turned hostile.'
    case 'abandoned':
      return 'The debate ended before it finished.'
    default:
      return 'Time ran out before you changed its mind.'
  }
}

function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
