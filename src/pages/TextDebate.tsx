import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'

import { stanceLabel } from '@shared/dailyTopics'
import { DEBATE_DURATION_MS } from '@shared/scoring'
import type { SessionOutcomeReason } from '@shared/types'
import { useAuth } from '../auth/context'
import HueyAvatar from '../components/HueyAvatar'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { SiteShareMark } from '../components/SiteBrand'
import { db } from '../firebase'
import {
  consumeTextLobbyPrefetch,
  finalizeSession,
  heartbeatTextLobby,
  joinTextLobby,
  leaveTextLobby,
  replyTextTurn,
  sendTextMessage,
  startSession,
  type TextLobbyPrefetchState,
} from '../lib/api'
import { getDebateChoice, getTodayTopic } from '../lib/dailyChoice'
import { stageShellStyle } from '../onboardingLayout'
import * as s from '../theme'

type Phase = 'lobby' | 'ai' | 'peer' | 'ending' | 'done'
type ChatLine = {
  id: string
  uid: string
  text: string
  kind?: string
  mine?: boolean
}

const MATCH_WAIT_MS = 9_000
/** Presence only — matching is watched via Firestore, not join polls. */
const HEARTBEAT_MS = 25_000
const MAX_WORDS_PER_MESSAGE = 20

const HUEY_BUBBLE_TONES = [
  { bg: 'rgba(212, 168, 74, 0.7)', ink: '#ffe9b8' }, // gold
  { bg: 'rgba(61, 184, 168, 0.7)', ink: '#b8f5ec' }, // teal
  { bg: 'rgba(154, 123, 200, 0.7)', ink: '#e4d4ff' }, // violet
  { bg: 'rgba(143, 191, 154, 0.7)', ink: '#d4f0da' }, // green
  { bg: 'rgba(232, 160, 120, 0.7)', ink: '#ffd8c4' }, // soft amber
  { bg: 'rgba(120, 180, 190, 0.7)', ink: '#c8eef2' }, // mist
]

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export default function TextDebate() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const choice = getDebateChoice()
  const topic = getTodayTopic()

  const [phase, setPhase] = useState<Phase>('lobby')
  const [statusLine, setStatusLine] = useState('Looking for someone arguing the other side…')
  const [lines, setLines] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(DEBATE_DURATION_MS)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [deadline, setDeadline] = useState(0)

  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const aiStarted = useRef(false)
  const matchedRef = useRef(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>('lobby')

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  useEffect(() => {
    if (!choice) {
      navigate('/today', { replace: true })
    }
  }, [choice, navigate])

  const startAiDebate = useCallback(async () => {
    if (!choice || aiStarted.current || matchedRef.current) return
    aiStarted.current = true
    setPhase('ai')
    setStatusLine('Debating Huey while no one else is here')
    setBusy(true)
    setError(null)
    try {
      await leaveTextLobby(choice.topicId).catch(() => {})
      const session = await startSession({
        topicId: choice.topicId,
        userSide: choice.userSide,
        modality: 'text',
      })
      setSessionId(session.sessionId)
      setDeadline(session.deadline)
      setRemainingMs(Math.max(0, session.deadline - Date.now()))
      const learned =
        typeof session.hueyContributionCount === 'number' && session.hueyContributionCount > 0
          ? ` Huey learned from ${session.hueyContributionCount} winner${session.hueyContributionCount === 1 ? '' : 's'} today.`
          : ''
      setLines([
        {
          id: 'sys-ai',
          uid: 'system',
          text: `You are arguing “${stanceLabel(topic, choice.stance)}.” Huey takes the other side. You have three minutes.${learned}`,
          kind: 'moderator',
        },
      ])
    } catch (caught) {
      console.error(caught)
      setError('Could not start the text debate. Try again.')
      setPhase('lobby')
      aiStarted.current = false
    } finally {
      setBusy(false)
    }
  }, [choice, topic])

  const startAiDebateRef = useRef(startAiDebate)
  startAiDebateRef.current = startAiDebate

  useEffect(() => {
    if (!choice || !user) return

    const topicId = choice.topicId
    const stance = choice.stance
    const uid = user.uid
    let cancelled = false
    let unsubQueue: (() => void) | null = null
    const prefetch = consumeTextLobbyPrefetch()

    function goPeer(roomIdValue: string) {
      if (matchedRef.current || aiStarted.current) return
      matchedRef.current = true
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      unsubQueue?.()
      unsubQueue = null
      setRoomId(roomIdValue)
      setPhase('peer')
      setStatusLine('Matched with a peer — moderated by Huey. Stay civil.')
      setDeadline(Date.now() + DEBATE_DURATION_MS)
    }

    function watchQueue() {
      const queueDoc = doc(db, 'textLobbies', topicId, 'queue', uid)
      unsubQueue = onSnapshot(
        queueDoc,
        (snap) => {
          if (cancelled || aiStarted.current || matchedRef.current) return
          const data = snap.data()
          if (data?.status === 'matched' && typeof data.roomId === 'string') {
            goPeer(data.roomId)
          }
        },
        () => {
          /* permission / missing doc — join below still owns the wait */
        },
      )
    }

    function startWaitingTimers(startedAt: number) {
      const elapsed = Date.now() - startedAt
      const remainingWait = Math.max(0, MATCH_WAIT_MS - elapsed)

      watchQueue()

      heartbeatTimer.current = setInterval(() => {
        void heartbeatTextLobby({ topicId, stance }).catch(() => {})
      }, HEARTBEAT_MS)

      if (remainingWait === 0) {
        if (!aiStarted.current && !matchedRef.current) {
          void startAiDebateRef.current()
        }
      } else {
        fallbackTimer.current = setTimeout(() => {
          if (!cancelled && !aiStarted.current && !matchedRef.current) {
            void startAiDebateRef.current()
          }
        }, remainingWait)
      }
    }

    async function enter(pre: TextLobbyPrefetchState | null) {
      if (pre?.result?.status === 'matched' && pre.result.roomId) {
        goPeer(pre.result.roomId)
        return
      }

      if (pre?.failed) {
        setStatusLine('Lobby unavailable — starting with Huey.')
        void startAiDebateRef.current()
        return
      }

      if (pre && !pre.failed) {
        if (pre.result?.status === 'waiting' || pre.result === null) {
          startWaitingTimers(pre.startedAt)
          if (pre.result === null) {
            try {
              const result = await joinTextLobby({ topicId, stance })
              if (cancelled) return
              if (result.status === 'matched' && result.roomId) {
                goPeer(result.roomId)
              }
            } catch {
              if (!cancelled) {
                setStatusLine('Lobby unavailable — starting with Huey.')
                void startAiDebateRef.current()
              }
            }
          }
          return
        }
        if (pre.result?.status === 'ai_fallback') {
          void startAiDebateRef.current()
          return
        }
      }

      try {
        const result = await joinTextLobby({ topicId, stance })
        if (cancelled) return
        if (result.status === 'matched' && result.roomId) {
          goPeer(result.roomId)
          return
        }
      } catch (caught) {
        console.error(caught)
        if (!cancelled) {
          setStatusLine('Lobby unavailable — starting with Huey.')
          void startAiDebateRef.current()
        }
        return
      }

      startWaitingTimers(Date.now())
    }

    void enter(prefetch)

    return () => {
      cancelled = true
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current)
      if (pollTimer.current) clearInterval(pollTimer.current)
      unsubQueue?.()
      // Only leave if we never matched / started AI (those paths leave themselves).
      if (!matchedRef.current && !aiStarted.current) {
        void leaveTextLobby(topicId).catch(() => {})
      }
    }
    // Stable primitive deps — object identity from getDebateChoice() must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- topicId/stance/uid gate only
  }, [choice?.topicId, choice?.stance, user?.uid])

  useEffect(() => {
    if (phase !== 'peer' || !roomId || !user) return

    const roomDoc = doc(db, 'textRooms', roomId)
    const unsubRoom = onSnapshot(roomDoc, (snap) => {
      const data = snap.data()
      if (!data) return
      if (typeof data.deadline === 'number') {
        setDeadline(data.deadline)
      }
      if (data.status === 'ended') {
        setPhase('done')
        setStatusLine(
          data.endedBy === user.uid
            ? 'You lost on civility.'
            : 'This peer debate has ended.',
        )
      }
    })

    const msgs = query(
      collection(db, 'textRooms', roomId, 'messages'),
      orderBy('createdAt', 'asc'),
    )
    const unsubMsgs = onSnapshot(msgs, (snap) => {
      setLines(
        snap.docs.map((d) => {
          const data = d.data() as { uid: string; text: string; kind?: string }
          return {
            id: d.id,
            uid: data.uid,
            text: data.text,
            kind: data.kind,
            mine: data.uid === user.uid,
          }
        }),
      )
    })

    return () => {
      unsubRoom()
      unsubMsgs()
    }
  }, [phase, roomId, user])

  const endAiSession = useCallback(
    async (reason?: SessionOutcomeReason) => {
      const id = sessionIdRef.current
      if (!id || phaseRef.current === 'ending' || phaseRef.current === 'done') return
      setPhase('ending')
      try {
        // Pass an explicit reason so finalizeSession accepts early "End and score"
        // (and timeout with clock skew) instead of requiring the hard deadline.
        await finalizeSession(id, reason ?? 'timeout')
        navigate(`/results/${id}`, { replace: true })
      } catch (caught) {
        console.error(caught)
        setError('Could not finish scoring. Try refreshing results later.')
        setPhase('done')
      }
    },
    [navigate],
  )

  useEffect(() => {
    if (!deadline || phase === 'lobby' || phase === 'done' || phase === 'ending') return
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now())
      setRemainingMs(left)
      if (left <= 0) {
        clearInterval(id)
        if (phaseRef.current === 'ai' && sessionIdRef.current) {
          void endAiSession('timeout')
        } else if (phaseRef.current === 'peer') {
          setPhase('done')
          setStatusLine('Time is up.')
        }
      }
    }, 250)
    return () => clearInterval(id)
  }, [deadline, phase, endAiSession])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [lines])

  async function send() {
    const text = draft.trim()
    if (!text || busy || !choice) return
    const words = countWords(text)
    if (words > MAX_WORDS_PER_MESSAGE) {
      setError(`Keep it to ${MAX_WORDS_PER_MESSAGE} words or fewer (${words} now).`)
      return
    }
    setDraft('')
    setBusy(true)
    setError(null)

    try {
      if (phase === 'peer' && roomId) {
        const result = await sendTextMessage(roomId, text)
        if (result.outcome === 'lost') {
          setPhase('done')
          setStatusLine(
            result.reason === 'hate_speech' || result.reason === 'incivility'
              ? 'You lost on civility.'
              : 'Debate ended.',
          )
        }
        return
      }

      if (phase === 'ai' && sessionId) {
        const optimistic: ChatLine = {
          id: `local-${Date.now()}`,
          uid: user?.uid ?? 'me',
          text,
          mine: true,
        }
        setLines((prev) => [...prev, optimistic])

        const result = await replyTextTurn(sessionId, text)
        if (result.aiText) {
          setLines((prev) => [
            ...prev,
            {
              id: `ai-${Date.now()}`,
              uid: 'ai',
              text: result.aiText!,
            },
          ])
        }
        if (result.remainingMs != null) {
          setRemainingMs(result.remainingMs)
        }
        if (result.outcome !== 'continue') {
          await endAiSession(result.reason ?? undefined)
        }
      }
    } catch (caught) {
      console.error(caught)
      setError('Message failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!choice) return null

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')
  const canChat = (phase === 'ai' || phase === 'peer') && !busy
  const draftWords = countWords(draft)
  const overWordLimit = draftWords > MAX_WORDS_PER_MESSAGE

  let hueyToneIndex = 0

  return (
    <div
      style={{
        ...stageShellStyle,
        background: 'transparent',
        color: s.color.text,
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        paddingTop: `max(88px, calc(env(safe-area-inset-top) + 78px))`,
        paddingBottom: `max(12px, env(safe-area-inset-bottom))`,
        boxSizing: 'border-box',
      }}
    >
      <OnboardingTopBrand />
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          marginLeft: 'auto',
          marginRight: 'auto',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
            textAlign: 'center',
          }}
        >
          <SiteShareMark size="debate" color={s.color.text} fullWidth={false} />
          <p
            style={{
              margin: 0,
              padding: '0 8px',
              fontFamily: s.font.serif,
              fontSize: 22,
              lineHeight: 1.35,
              color: s.color.text,
              maxWidth: '100%',
            }}
          >
            {topic.question}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: s.color.textMuted, flex: 1 }}>
            {statusLine}
          </p>
          {phase === 'ai' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HueyAvatar size="sm" active={busy} variant="color" label="Huey" />
              <span style={{ fontSize: 13, color: s.color.textMuted }}>Huey</span>
            </div>
          )}
          {phase !== 'lobby' && (
            <span
              style={{
                fontFamily: s.font.mono,
                fontSize: 16,
                color: remainingMs < 30_000 ? s.color.danger : s.color.text,
              }}
            >
              {mm}:{ss}
            </span>
          )}
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            paddingBottom: 12,
          }}
        >
          {phase === 'lobby' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
                paddingTop: 24,
              }}
            >
              <HueyAvatar size="lg" active variant="color" label="Huey" />
            </div>
          )}
          {lines.map((line) => {
            const isHuey = line.uid === 'ai' && line.kind !== 'moderator'
            const hueyTone = isHuey
              ? HUEY_BUBBLE_TONES[hueyToneIndex++ % HUEY_BUBBLE_TONES.length]!
              : null
            return (
            <div
              key={line.id}
              style={{
                alignSelf:
                  line.kind === 'moderator' ? 'stretch' : line.mine ? 'flex-end' : 'flex-start',
                maxWidth: line.kind === 'moderator' ? '100%' : '88%',
                padding: '10px 12px',
                ...(line.kind === 'moderator'
                  ? {
                      background: 'transparent',
                      border: `1px solid ${s.color.border}`,
                      color: s.color.textMuted,
                    }
                  : hueyTone
                    ? {
                        ...s.tintedFill(hueyTone.bg),
                        border: 'none',
                        color: hueyTone.ink,
                      }
                    : {
                        ...s.tintedFill(
                          line.mine ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.4)',
                        ),
                        border: 'none',
                        color: s.color.text,
                      }),
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
              {line.kind !== 'moderator' && (
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: hueyTone ? hueyTone.ink : s.color.textFaint,
                    opacity: hueyTone ? 0.75 : 1,
                    marginBottom: 4,
                  }}
                >
                  {line.mine ? 'You' : line.uid === 'ai' ? 'Huey' : 'Opponent'}
                </span>
              )}
              {line.text}
            </div>
            )
          })}
        </div>

        {error && <div style={{ ...s.errorBox, marginTop: 0, marginBottom: 10 }}>{error}</div>}

        {phase === 'done' ? (
          <button
            type="button"
            onClick={() => navigate('/today', { replace: true })}
            style={{ ...s.buttonPrimary, minHeight: 48 }}
          >
            Back to today
          </button>
        ) : phase === 'ai' || phase === 'peer' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder="Your argument (20 words max)…"
                disabled={!canChat}
                style={{ ...s.input, flex: 1 }}
              />
              <button
                type="button"
                disabled={!canChat || !draft.trim() || overWordLimit}
                onClick={() => void send()}
                style={{
                  ...s.disabled(s.buttonPrimary, !canChat || !draft.trim() || overWordLimit),
                  width: 'auto',
                  paddingLeft: 18,
                  paddingRight: 18,
                }}
              >
                Send
              </button>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: overWordLimit ? s.color.danger : s.color.textFaint,
                textAlign: 'right',
              }}
            >
              {draftWords} / {MAX_WORDS_PER_MESSAGE} words
            </p>
          </div>
        ) : null}

        {phase === 'ai' && sessionId && (
          <button
            type="button"
            onClick={() => void endAiSession()}
            style={{
              ...s.buttonSecondary,
              marginTop: 10,
              minHeight: 40,
              fontSize: 14,
            }}
          >
            End and score
          </button>
        )}
      </div>
    </div>
  )
}
