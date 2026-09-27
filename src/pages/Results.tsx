import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { listResourceLinks } from '@shared/factBank'
import { normalizeSessionStatus, outcomeLossSummary } from '@shared/rules'
import { getTopic, sideLabel } from '@shared/topics'
import type { DebateSession, JudgeScores, SessionResults, SessionStatus } from '@shared/types'
import { useAuth } from '../auth/context'
import AnalyticsMetrics, { deriveAnalyticMetrics } from '../components/AnalyticsMetrics'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import ShareResultHero, { HeroCircleFrame } from '../components/ShareResultHero'
import { SiteBrandFooter } from '../components/SiteBrand'
import Spectrum from '../components/Spectrum'
import { finalizeSession, getSession } from '../lib/api'
import { stageShellStyle } from '../onboardingLayout'
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
    help: 'Whether you answered what Huey actually argued.',
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
  const verdict = status ? normalizeSessionStatus(status) : 'lost'
  const won = verdict === 'passed'
  const scores = results.finalScores
  const judgeVerdict = results.judgeVerdict
  const resources = listResourceLinks(session.topic)
  const highlightFactIds = new Set(judgeVerdict?.topics_for_resource_screen ?? [])
  const metrics = deriveAnalyticMetrics(results, session)

  const topicLine = `${topic.label} — you argued the ${sideLabel(session.userSide, topic)} side.`
  const lossReason = outcomeLossSummary(session.outcomeReason, verdict)

  // --- Lose: Today-style minimal composition (black field, one job per beat) ---
  if (!won) {
    return (
      <div
        style={{
          ...stageShellStyle,
          background: 'transparent',
          color: s.color.text,
          overflowY: 'auto',
          paddingTop: `max(96px, calc(env(safe-area-inset-top) + 88px))`,
          paddingBottom: `max(40px, env(safe-area-inset-bottom))`,
        }}
      >
        <OnboardingTopBrand />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 540,
            marginLeft: 'auto',
            marginRight: 'auto',
            boxSizing: 'border-box',
          }}
        >
          <p
            style={{
              margin: '8px 0 10px',
              fontFamily: s.font.serif,
              fontSize: 16,
              lineHeight: 1.35,
              color: s.color.textMuted,
            }}
          >
            {topic.label}
          </p>

          <h1
            style={{
              ...s.heading,
              fontSize: 42,
              margin: '0 0 12px',
              lineHeight: 1.1,
            }}
          >
            You lost
          </h1>

          {lossReason && (
            <p
              style={{
                margin: '0 0 28px',
                fontFamily: s.font.serif,
                fontSize: 18,
                lineHeight: 1.45,
                color: s.color.textMuted,
              }}
            >
              {lossReason}
            </p>
          )}

          <div style={{ marginBottom: 28 }}>
            <p
              style={{
                margin: '0 0 12px',
                fontFamily: s.font.serif,
                fontSize: 15,
                color: s.color.textFaint,
              }}
            >
              Where you sit
            </p>
            <Spectrum results={results} labeled />
            <p
              style={{
                margin: '14px 0 0',
                fontFamily: s.font.serif,
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1,
                color: s.color.text,
              }}
            >
              {Math.round(results.polarizationScore * 100)}
              <span style={{ fontSize: 15, fontWeight: 500, color: s.color.textFaint }}>
                {' '}
                / 100
              </span>
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 28,
            }}
          >
            {metrics.slice(0, 4).map((m) => (
              <div
                key={m.id}
                style={{
                  ...s.tintedFill('rgba(255, 255, 255, 0.5)'),
                  padding: '12px 14px',
                  minWidth: 96,
                  flex: '1 1 96px',
                }}
              >
                <div
                  style={{
                    fontFamily: s.font.serif,
                    fontSize: 22,
                    fontWeight: 700,
                    color: s.color.text,
                    lineHeight: 1,
                  }}
                >
                  {m.score}
                  <span style={{ fontSize: 12, fontWeight: 500, color: s.color.textFaint }}>
                    /10
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: s.font.serif,
                    fontSize: 13,
                    color: s.color.textMuted,
                  }}
                >
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigate('/today')}
            style={{
              ...s.buttonPrimary,
              borderRadius: 8,
              minHeight: 52,
              fontSize: 16,
            }}
          >
            Today’s debate
          </button>

          <details style={{ marginTop: 36 }}>
            <summary
              style={{
                fontFamily: s.font.serif,
                fontSize: 15,
                color: s.color.textMuted,
                cursor: 'pointer',
                userSelect: 'none',
                listStyle: 'none',
              }}
            >
              More detail
            </summary>
            <div style={{ marginTop: 20 }}>
              <DetailBody
                results={results}
                session={session}
                scores={scores}
                judgeVerdict={judgeVerdict}
                metrics={metrics}
                lossReason={lossReason}
                resources={resources}
                highlightFactIds={highlightFactIds}
                topicLine={topicLine}
                navigate={navigate}
                showPrimaryCta={false}
              />
            </div>
          </details>
        </div>
      </div>
    )
  }

  // --- Win: shareable story crop, then analytics ---
  return (
    <div
      style={{
        ...s.page,
        justifyContent: 'flex-start',
        padding: 0,
        minHeight: '100dvh',
        overflowY: 'auto',
        background: s.color.bg,
      }}
    >
      <ShareResultHero
        won={won}
        topicLabel={topic.label}
        detailLine={lossReason ?? undefined}
        center={
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          >
            <span
              style={{
                display: 'block',
                marginBottom: 10,
                fontSize: 15,
                color: s.color.textMuted,
                fontFamily: s.font.serif,
              }}
            >
              Where you are politically
            </span>
            <HeroCircleFrame>
              <div style={{ width: '96%', marginLeft: 'auto', marginRight: 'auto' }}>
                <Spectrum results={results} compact labeled />
              </div>
            </HeroCircleFrame>
          </div>
        }
        metrics={<AnalyticsMetrics metrics={metrics} lossReason={lossReason} />}
      />

      <div
        id="results-analytics"
        style={{
          ...s.card,
          maxWidth: 560,
          width: '100%',
          marginLeft: 'auto',
          marginRight: 'auto',
          paddingTop: 28,
          paddingBottom: 24,
          paddingLeft: `max(20px, env(safe-area-inset-left))`,
          paddingRight: `max(20px, env(safe-area-inset-right))`,
          boxSizing: 'border-box',
          background: 'transparent',
        }}
      >
        <DetailBody
          results={results}
          session={session}
          scores={scores}
          judgeVerdict={judgeVerdict}
          metrics={metrics}
          lossReason={lossReason}
          resources={resources}
          highlightFactIds={highlightFactIds}
          topicLine={topicLine}
          navigate={navigate}
          showPrimaryCta
        />
      </div>
    </div>
  )
}

function DetailBody({
  results,
  session,
  scores,
  judgeVerdict,
  metrics,
  lossReason,
  resources,
  highlightFactIds,
  topicLine,
  navigate,
  showPrimaryCta,
}: {
  results: SessionResults
  session: DebateSession
  scores: SessionResults['finalScores']
  judgeVerdict: SessionResults['judgeVerdict']
  metrics: ReturnType<typeof deriveAnalyticMetrics>
  lossReason: string | null
  resources: ReturnType<typeof listResourceLinks>
  highlightFactIds: Set<string>
  topicLine: string
  navigate: ReturnType<typeof useNavigate>
  showPrimaryCta: boolean
}) {
  return (
    <>
      <h2 style={{ ...s.heading, fontSize: 20, marginBottom: 8 }}>Analytics</h2>
      <p style={{ ...s.subheading, fontSize: 14, marginBottom: 24 }}>
        Scores, takeaways, and sources from this debate.
      </p>

      <span style={s.label}>Where you sit politically</span>

      <div style={{ margin: '12px 0 4px' }}>
        <Spectrum results={results} labeled />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1,
            color: s.color.text,
            fontFamily: s.font.serif,
          }}
        >
          {Math.round(results.polarizationScore * 100)}
          <span style={{ fontSize: 18, color: s.color.textFaint }}>/100</span>
        </div>
        <div style={{ fontSize: 13, color: s.color.textMuted, marginTop: 8 }}>
          The bright dot is you. Closer to the center means more open to the other side.
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <span style={s.label}>How you argued (1–10)</span>
        <AnalyticsMetrics metrics={metrics} lossReason={lossReason} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Component
          label="From your answers"
          value={results.diagnosticComponent}
          help="How strongly you hold your views across the diagnostic topics."
        />
        <Component
          label="From the debate"
          value={results.conversationComponent}
          help="How you engaged: tradeoffs, civility, answering their points."
        />
      </div>

      <h2 style={{ ...s.heading, fontSize: 17, marginTop: 32, marginBottom: 4 }}>How you argued</h2>
      <p style={{ ...s.subheading, fontSize: 13, marginBottom: 18 }}>
        {judgeVerdict || scores
          ? 'Scored by a separate judge model — not Huey.'
          : 'There was not enough conversation to score.'}
      </p>

      {judgeVerdict && !judgeVerdict.session_terminate && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <Component
            label="Respectfulness"
            value={judgeVerdict.respect_score / 100}
            help="Interruptions, tone, and dismissiveness (from event log + transcript)."
          />
          <Component
            label="Argument quality"
            value={judgeVerdict.argument_quality_score / 100}
            help="Facts from the verified bank, answering their points, and consistency."
          />
        </div>
      )}

      {judgeVerdict && judgeVerdict.fact_checks.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span style={s.label}>Fact checks</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {judgeVerdict.fact_checks.slice(0, 6).map((check, index) => (
              <div
                key={index}
                style={{
                  padding: '12px 14px',
                  border: `1px solid ${
                    highlightFactIds.has(check.fact_id ?? '') ? s.color.win : s.color.border
                  }`,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: s.color.textMuted,
                }}
              >
                <span style={{ fontFamily: s.font.mono, color: s.color.textFaint }}>
                  Turn {check.turn} · {check.status}
                  {check.fact_id ? ` · ${check.fact_id}` : ''}
                </span>
                <div style={{ marginTop: 6, color: s.color.text }}>{check.claim}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!judgeVerdict &&
        scores &&
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
              <div style={{ height: 3, background: s.color.bg, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(value / criterion.max) * 100}%`,
                    background: s.color.text,
                  }}
                />
              </div>
              <div style={{ fontSize: 12, color: s.color.textFaint, marginTop: 5 }}>
                {criterion.help}
              </div>
            </div>
          )
        })}

      {!judgeVerdict && scores?.unverified_fact_citation && (
        <div
          style={{
            marginTop: 20,
            padding: '14px 16px',
            border: `1px solid ${s.color.border}`,
            fontSize: 14,
            lineHeight: 1.55,
            color: s.color.textMuted,
          }}
        >
          You cited at least one specific fact we could not verify against this topic&apos;s
          approved fact bank. That does not mean you were wrong — bring a source next time, or stick
          to the verified list in your rematch.
        </div>
      )}

      <h2 style={{ ...s.heading, fontSize: 17, marginTop: 30, marginBottom: 14 }}>
        Go deeper on this topic
      </h2>
      <p style={{ ...s.subheading, fontSize: 13, marginBottom: 14 }}>
        Two strong cases on each side (not strawmen) plus one balanced overview.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
        {resources.map((link, index) => (
          <a
            key={`${link.url}-${index}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              padding: '12px 14px',
              border: `1px solid ${s.color.border}`,
              color: s.color.text,
              textDecoration: 'none',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            <span style={{ color: s.color.textFaint, fontSize: 12 }}>{link.role}</span>
            <div style={{ marginTop: 4 }}>{link.title}</div>
          </a>
        ))}
      </div>

      <h2 style={{ ...s.heading, fontSize: 17, marginTop: 30, marginBottom: 14 }}>
        What to take away
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.takeaways.map((takeaway, index) => (
          <div
            key={index}
            style={{
              padding: '14px 16px',
              fontSize: 15,
              lineHeight: 1.55,
              color: s.color.text,
              background: 'transparent',
              border: `1px solid ${s.color.border}`,
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
                  fontSize: 13,
                  color: entry.speaker === 'user' ? s.color.text : s.color.textFaint,
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

      {showPrimaryCta && (
        <>
          <div
            style={{
              marginTop: 28,
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'stretch',
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/today')}
              style={{ ...s.buttonPrimary, flex: '1 1 140px', minHeight: 48 }}
            >
              Today’s debate
            </button>
            <button
              type="button"
              onClick={() => navigate('/diagnostic')}
              style={{ ...s.buttonSecondary, flex: '1 1 140px', minHeight: 48 }}
            >
              Diagnostic (optional)
            </button>
          </div>
          <p style={{ ...s.subheading, fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Come back tomorrow for a new topic — or debate again with today’s question.
          </p>
        </>
      )}

      <SiteBrandFooter topicLine={topicLine} style={{ marginTop: 'auto', paddingTop: 36 }} />
    </>
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
        background: 'transparent',
        border: `1px solid ${s.color.border}`,
      }}
    >
      <div style={{ fontSize: 13, color: s.color.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: s.font.serif, lineHeight: 1 }}>
        {Math.round(value * 100)}
      </div>
      <div style={{ fontSize: 12, color: s.color.textFaint, marginTop: 8, lineHeight: 1.4 }}>
        {help}
      </div>
    </div>
  )
}
