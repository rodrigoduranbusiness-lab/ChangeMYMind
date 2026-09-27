import { useNavigate, useParams } from 'react-router-dom'

import { normalizeSessionStatus, outcomeLossSummary } from '@shared/rules'
import { getTopic } from '@shared/topics'
import { deriveAnalyticMetrics } from '../components/AnalyticsMetrics'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import Spectrum from '../components/Spectrum'
import { useSessionResults } from '../hooks/useSessionResults'
import { stageShellStyle } from '../onboardingLayout'
import * as s from '../theme'

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { session, results, status, error, loading } = useSessionResults(sessionId)

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

  if (loading || !results || !session) {
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
  const metrics = deriveAnalyticMetrics(results, session)
  const lossReason = outcomeLossSummary(session.outcomeReason, verdict)

  // Today-style minimal composition for both win and lose.
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
          {won ? 'You won' : 'You lost'}
        </h1>

        <p
          style={{
            margin: '0 0 28px',
            fontFamily: s.font.serif,
            fontSize: 18,
            lineHeight: 1.45,
            color: s.color.textMuted,
          }}
        >
          {won
            ? 'You cleared the pass bar. Huey had to take your case seriously.'
            : (lossReason ?? 'The debate ended without meeting the pass thresholds.')}
        </p>

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
                ...s.tintedFill(
                  won ? 'rgba(143, 191, 154, 0.55)' : 'rgba(255, 255, 255, 0.5)',
                ),
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate(`/results/${sessionId}/review`)}
            style={{
              ...s.buttonPrimary,
              borderRadius: 8,
              minHeight: 52,
              fontSize: 16,
            }}
          >
            Full review
          </button>
          <button
            type="button"
            onClick={() => navigate('/today')}
            style={{
              ...s.buttonSecondary,
              borderRadius: 8,
              minHeight: 52,
              fontSize: 16,
            }}
          >
            Today’s debate
          </button>
        </div>
      </div>
    </div>
  )
}
