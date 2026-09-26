import { useState } from 'react'

import type { DebateSession, JudgeScores, JudgeSessionVerdict, SessionResults } from '@shared/types'
import * as s from '../theme'

export type MetricId = 'filler' | 'tone' | 'fallacies' | 'thinking'

export type AnalyticMetric = {
  id: MetricId
  label: string
  help: string
  /** Integer 1–10, higher is better. */
  score: number
}

const FILLERS = [
  'um',
  'uh',
  'er',
  'ah',
  'like',
  'you know',
  'i mean',
  'sort of',
  'kind of',
  'basically',
  'literally',
  'right?',
  'okay so',
]

function clamp10(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)))
}

/** Map a 0–10 rubric (or 0–100 / 10) onto 1–10. */
function fromTen(value: number | undefined, fallback = 5): number {
  if (value === undefined || Number.isNaN(value)) return fallback
  if (value > 10) return clamp10(value / 10)
  return clamp10(value)
}

function countFillers(text: string): number {
  const lower = text.toLowerCase()
  let count = 0
  for (const word of FILLERS) {
    const pattern = new RegExp(`\\b${word.replace(/[?*]/g, '\\$&')}\\b`, 'gi')
    const matches = lower.match(pattern)
    if (matches) count += matches.length
  }
  return count
}

/** Fewer fillers → higher score. Rough: 0 fillers = 10, ~20+ = 1. */
function fillerScoreFromTranscript(session: DebateSession | null): number {
  if (!session?.transcript?.length) return 6
  const userText = session.transcript
    .filter((t) => t.speaker === 'user')
    .map((t) => t.text)
    .join(' ')
  if (!userText.trim()) return 6
  const count = countFillers(userText)
  const words = userText.trim().split(/\s+/).length
  const rate = words > 0 ? count / words : 0
  // ~0% fillers → 10; ~8%+ → 1
  return clamp10(10 - rate * 110)
}

function fallaciesFromScores(
  scores: JudgeScores | null | undefined,
  verdict: JudgeSessionVerdict | null | undefined,
): number {
  if (scores?.gaming_detected) return 2
  if (verdict) {
    const bad = verdict.fact_checks.filter(
      (c) => c.status === 'contradicted' || c.status === 'unverified',
    ).length
    const total = Math.max(verdict.fact_checks.length, 1)
    const cleanRatio = 1 - bad / total
    let base = clamp10(1 + cleanRatio * 9)
    if (verdict.penalty_events.length >= 3) base = Math.max(1, base - 2)
    else if (verdict.penalty_events.length >= 1) base = Math.max(1, base - 1)
    return base
  }
  if (!scores) return 5
  let score = 8
  if (scores.unverified_fact_citation) score -= 3
  if (scores.ignored_last_point) score -= 2
  if (scores.repeated_without_evidence) score -= 2
  if (scores.failed_direct_answer) score -= 1
  return clamp10(score)
}

/**
 * Build the four share-screen metrics from judge output + transcript.
 * Prefer live session verdict when present; fall back to legacy rubric.
 */
export function deriveAnalyticMetrics(
  results: SessionResults,
  session: DebateSession | null,
): AnalyticMetric[] {
  const scores = results.finalScores
  const verdict = results.judgeVerdict

  const tone = verdict
    ? fromTen(verdict.respect_score / 10)
    : fromTen(scores?.civility_tone)

  const thinking = verdict
    ? fromTen(verdict.argument_quality_score / 10)
    : fromTen(scores?.addresses_ai_points ?? scores?.evidence_reasoning)

  return [
    {
      id: 'filler',
      label: 'Filler words',
      help: 'How clean your speech stayed — fewer ums, likes, and hedges scores higher.',
      score: fillerScoreFromTranscript(session),
    },
    {
      id: 'tone',
      label: 'Tone',
      help: 'Civility and respect toward the other side.',
      score: tone,
    },
    {
      id: 'fallacies',
      label: 'Fallacies',
      help: 'Avoiding gaming, dodges, and unsupported or contradicted claims.',
      score: fallaciesFromScores(scores, verdict),
    },
    {
      id: 'thinking',
      label: 'Thinking on your feet',
      help: 'How well you answered their points in the moment.',
      score: thinking,
    },
  ]
}

/** Red (1) → amber → green (10), no purple. */
export function scoreColor(score: number): string {
  const t = (clamp10(score) - 1) / 9
  if (t < 0.5) {
    const u = t / 0.5
    return lerpHex('#c4453a', '#c9a227', u)
  }
  const u = (t - 0.5) / 0.5
  return lerpHex('#c9a227', '#4a9b6a', u)
}

function lerpHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  const r = Math.round(ar! + (br! - ar!) * t)
  const g = Math.round(ag! + (bg! - ag!) * t)
  const bl = Math.round(ab! + (bb! - ab!) * t)
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

type Props = {
  metrics: AnalyticMetric[]
  /** Shown above the bars when the user lost. */
  lossReason?: string | null
}

/**
 * Four color bars (1–10). Labels stay hidden until the row is clicked.
 */
export default function AnalyticsMetrics({ metrics, lossReason }: Props) {
  const [openId, setOpenId] = useState<MetricId | null>(null)

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 420,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
      role="list"
      aria-label="Debate analytics. Tap a bar to see what it measures."
    >
      {lossReason && (
        <p
          style={{
            margin: '0 0 14px',
            padding: '10px 12px',
            fontFamily: s.font.serif,
            fontSize: 14,
            lineHeight: 1.45,
            color: s.color.text,
            border: `1px solid ${s.color.border}`,
            background: s.color.panelRaised,
            textAlign: 'left',
          }}
        >
          <span style={{ color: s.color.textMuted }}>Why you lost: </span>
          {lossReason}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {metrics.map((metric) => {
          const open = openId === metric.id
          const color = scoreColor(metric.score)
          return (
            <button
              key={metric.id}
              type="button"
              role="listitem"
              aria-expanded={open}
              aria-label={
                open
                  ? `${metric.label}: ${metric.score} out of 10. ${metric.help}`
                  : `Score ${metric.score} out of 10. Tap to reveal metric.`
              }
              onClick={() => setOpenId(open ? null : metric.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '10px 4px',
                margin: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: s.font.serif,
                color: s.color.text,
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: 72,
                  background: 'rgba(255,255,255,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  borderRadius: 0,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${(metric.score / 10) * 100}%`,
                    background: color,
                    minHeight: metric.score > 0 ? 8 : 0,
                    transition: 'height 280ms ease',
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: s.font.mono,
                  fontSize: 15,
                  fontVariantNumeric: 'tabular-nums',
                  color,
                }}
              >
                {metric.score}
              </span>
            </button>
          )
        })}
      </div>

      {openId && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            border: `1px solid ${s.color.borderStrong}`,
            textAlign: 'left',
          }}
        >
          {(() => {
            const metric = metrics.find((m) => m.id === openId)!
            return (
              <>
                <div style={{ fontSize: 16, fontWeight: 600, color: s.color.text }}>
                  {metric.label}
                  <span style={{ color: s.color.textFaint, fontWeight: 400 }}>
                    {' '}
                    · {metric.score}/10
                  </span>
                </div>
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: s.color.textMuted,
                  }}
                >
                  {metric.help}
                </p>
              </>
            )
          })()}
        </div>
      )}

      {!openId && (
        <p
          style={{
            margin: '12px 0 0',
            textAlign: 'center',
            fontSize: 12,
            color: s.color.textFaint,
          }}
        >
          Tap a bar to see what it measures
        </p>
      )}
    </div>
  )
}
