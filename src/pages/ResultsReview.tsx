import { useNavigate, useParams } from 'react-router-dom'

import { listResourceLinks } from '@shared/factBank'
import { outcomeLossSummary, normalizeSessionStatus } from '@shared/rules'
import { getTopic, sideLabel } from '@shared/topics'
import type { JudgeScores } from '@shared/types'
import AnalyticsMetrics, { deriveAnalyticMetrics } from '../components/AnalyticsMetrics'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { SiteBrandFooter } from '../components/SiteBrand'
import Spectrum from '../components/Spectrum'
import { useSessionResults } from '../hooks/useSessionResults'
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

export default function ResultsReview() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { session, results, status, error, loading } = useSessionResults(sessionId)

  if (error) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <h1 style={s.heading}>Review unavailable</h1>
          <p style={{ ...s.subheading, marginTop: 12 }}>{error}</p>
          <div style={{ marginTop: 20 }}>
            <button type="button" onClick={() => navigate('/today')} style={s.buttonPrimary}>
              Today’s debate
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !session || !results || !status) {
    return (
      <div style={s.page}>
        <p style={s.subheading}>Loading review…</p>
      </div>
    )
  }

  const topic = getTopic(session.topic)
  const verdict = status ? normalizeSessionStatus(status) : 'lost'
  const scores = results.finalScores
  const judgeVerdict = results.judgeVerdict
  const resources = listResourceLinks(session.topic)
  const highlightFactIds = new Set(judgeVerdict?.topics_for_resource_screen ?? [])
  const metrics = deriveAnalyticMetrics(results, session)
  const lossReason = outcomeLossSummary(session.outcomeReason, verdict)
  const topicLine = `${topic.label} — you argued the ${sideLabel(session.userSide, topic)} side.`

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
          maxWidth: 560,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={() => navigate(`/results/${sessionId}`)}
          style={{
            margin: '0 0 16px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: s.font.serif,
            fontSize: 15,
            color: s.color.textMuted,
          }}
        >
          ← Outcome
        </button>

        <h1 style={{ ...s.heading, fontSize: 28, marginBottom: 8 }}>Full review</h1>
        <p style={{ ...s.subheading, fontSize: 14, marginBottom: 28 }}>
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
          <ScoreCard
            label="From your answers"
            value={results.diagnosticComponent}
            help="How strongly you hold your views across the diagnostic topics."
          />
          <ScoreCard
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
            <ScoreCard
              label="Respectfulness"
              value={judgeVerdict.respect_score / 100}
              help="Interruptions, tone, and dismissiveness (from event log + transcript)."
            />
            <ScoreCard
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

        <SiteBrandFooter topicLine={topicLine} style={{ marginTop: 'auto', paddingTop: 36 }} />
      </div>
    </div>
  )
}

function ScoreCard({
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
