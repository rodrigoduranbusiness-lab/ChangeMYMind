import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getTopic } from '@shared/topics'
import type { DebateSession, JudgeScores, SessionResults, SessionStatus } from '@shared/types'
import { useAuth } from '../auth/context'
import Spectrum from '../components/Spectrum'
import { finalizeSession, getSession } from '../lib/api'
import * as s from '../theme'

const CRITERIA: Array<{ key: keyof JudgeScores; label: string; max: number; help: string }> = [
  {
    key: 'evidence_reasoning',
    label: 'Evidence and reasoning',
    max: 10,
    help: 'Whether your claims were supported and your logic held up.',
  },
  {
    key: 'civility_tone',
    label: 'Civility',
    max: 10,
    help: 'Whether you treated the other side as arguing in good faith.',
  },
  {
    key: 'acknowledges_tradeoffs',
    label: 'Acknowledging tradeoffs',
    max: 10,
    help: 'Whether you granted the real costs of your own position.',
  },
  {
    key: 'addresses_ai_points',
    label: 'Engaging their points',
    max: 10,
    help: 'Whether you answered what the AI actually argued.',
  },
  {
    key: 'persuasion',
    label: 'Persuasion',
    max: 100,
    help: 'How much a fair-minded opponent would have reconsidered.',
  },
]

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [session, setSession] = useState<DebateSession | null>(null)
  const [results, setResults] = useState<SessionResults | null>(null)
  const [status, setStatus] = useState<SessionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !sessionId) return

    let cancelled = false

    void (async () => {
      try {
        // Idempotent: computes and stores the results the first time, returns
        // the stored copy afterwards.
        const finalized = await finalizeSession(sessionId)
        if (cancelled) return

        setResults(finalized.results)
        setStatus(finalized.status)
        setSession(await getSession(user.uid, sessionId))
      } catch (caught) {
        console.error('Failed to load results', caught)
        if (cancelled) return

        // Maybe it was already finalized but the callable failed; try a read.
        const stored = await getSession(user.uid, sessionId).catch(() => null)
        if (stored?.results) {
          setSession(stored)
          setResults(stored.results)
          setStatus(stored.status)
          return
        }
        setError('We could not load the results for this debate.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user, sessionId])

  if (error) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>Results unavailable</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>{error}</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" onClick={() => navigate('/')} style={s.buttonPrimary}>
              Back to the start
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!results || !session) {
    return (
      <div style={s.page}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: `2px solid ${s.color.border}`,
            borderTopColor: s.color.accent,
            animation: 'cg-spin 700ms linear infinite',
          }}
        />
        <p style={{ ...s.subheading, marginTop: 16 }}>Scoring your debate…</p>
      </div>
    )
  }

  const topic = getTopic(session.topic)
  const won = status === 'won'
  const scores = results.finalScores

  return (
    <div style={{ ...s.page, justifyContent: 'flex-start', paddingTop: 48 }}>
      <div style={{ ...s.card, maxWidth: 560 }}>
        <span style={s.label}>Your polarization</span>

        <div style={{ margin: '18px 0 8px' }}>
          <Spectrum results={results} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: s.color.accent,
            }}
          >
            {Math.round(results.polarizationScore * 100)}
            <span style={{ fontSize: 18, color: s.color.textFaint }}>/100</span>
          </div>
          <div style={{ fontSize: 13, color: s.color.textMuted, marginTop: 8 }}>
            The bright dot is you. Faint dots are your four topics. Closer to the center means
            more open to the other side.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 18px',
            background: won ? 'rgba(63, 185, 80, 0.09)' : 'rgba(212, 84, 74, 0.09)',
            border: `1px solid ${won ? 'rgba(63, 185, 80, 0.3)' : 'rgba(212, 84, 74, 0.3)'}`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: won ? s.color.win : s.color.lose,
            }}
          >
            {won ? 'WON' : 'LOST'}
          </div>
          <div style={{ fontSize: 14, color: s.color.textMuted, lineHeight: 1.45 }}>
            {topic.label} — you argued the {session.userSide === 'left' ? 'left' : 'right'} side.
          </div>
        </div>

        {/* Component split, so the score is not a black box. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Component
            label="From your answers"
            value={results.diagnosticComponent}
            help="How strongly you hold your views across all four topics."
          />
          <Component
            label="From the debate"
            value={results.conversationComponent}
            help="How you engaged: tradeoffs, civility, answering their points."
          />
        </div>

        <h2 style={{ ...s.heading, fontSize: 17, marginTop: 32, marginBottom: 4 }}>
          How you argued
        </h2>
        <p style={{ ...s.subheading, fontSize: 13, marginBottom: 18 }}>
          {scores
            ? 'Scored by an impartial judge that never saw which side you were on.'
            : 'There was not enough conversation to score.'}
        </p>

        {scores &&
          CRITERIA.map((criterion) => {
            const value = scores[criterion.key] as number
            return (
              <div key={String(criterion.key)} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{criterion.label}</span>
                  <span style={{ fontFamily: s.font.mono, fontSize: 13, color: s.color.accent }}>
                    {value}
                    <span style={{ color: s.color.textFaint }}>/{criterion.max}</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    background: s.color.bg,
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${(value / criterion.max) * 100}%`,
                      background: s.color.accent,
                      borderRadius: 999,
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: s.color.textFaint, marginTop: 5 }}>
                  {criterion.help}
                </div>
              </div>
            )
          })}

        <h2 style={{ ...s.heading, fontSize: 17, marginTop: 30, marginBottom: 14 }}>
          What to take away
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.takeaways.map((takeaway, index) => (
            <div
              key={index}
              style={{
                padding: '14px 16px',
                fontSize: 14,
                lineHeight: 1.55,
                color: s.color.text,
                background: s.color.bg,
                border: `1px solid ${s.color.border}`,
                borderRadius: 10,
              }}
            >
              {takeaway}
            </div>
          ))}
        </div>

        <details style={{ marginTop: 26 }}>
          <summary
            style={{
              fontSize: 13,
              color: s.color.textMuted,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            Read the transcript ({session.transcript.length} turns)
          </summary>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {session.transcript.map((entry, index) => (
              <div key={index}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: entry.speaker === 'user' ? s.color.accent : s.color.textFaint,
                    marginBottom: 4,
                  }}
                >
                  {entry.speaker === 'user' ? 'You' : 'The AI'}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, color: s.color.textMuted }}>
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        </details>

        <div style={{ marginTop: 28 }}>
          <button type="button" onClick={() => navigate('/diagnostic')} style={s.buttonSecondary}>
            Retake the questions
          </button>
        </div>
      </div>
    </div>
  )
}

function Component({
  label,
  value,
  help,
}: {
  label: string
  value: number
  help: string
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '14px 16px',
        background: s.color.bg,
        border: `1px solid ${s.color.border}`,
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 12, color: s.color.textFaint, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: s.font.mono, fontSize: 22, fontWeight: 600 }}>
        {Math.round(value * 100)}
      </div>
      <div style={{ fontSize: 11, color: s.color.textFaint, marginTop: 6, lineHeight: 1.45 }}>
        {help}
      </div>
    </div>
  )
}
