import { CONDUCT_EVENTS_NEEDS_WORK } from './conduct'
import type { JudgeSessionVerdict, SessionOutcomeReason, SessionStatus } from './types'

export const PASS_RESPECT_THRESHOLD = 70
export const PASS_QUALITY_THRESHOLD = 70

export function normalizeJudgeVerdict(raw: unknown): JudgeSessionVerdict {
  const data = (raw ?? {}) as Record<string, unknown>

  const penaltyRaw = Array.isArray(data.penalty_events) ? data.penalty_events : []
  const factRaw = Array.isArray(data.fact_checks) ? data.fact_checks : []

  const penalty_events = penaltyRaw
    .map((item) => {
      const row = item as Record<string, unknown>
      const type = row.type
      if (
        type !== 'interruption' &&
        type !== 'yelling' &&
        type !== 'insult' &&
        type !== 'dismissiveness'
      ) {
        return null
      }
      const source = row.source === 'judge_detected' ? 'judge_detected' : 'event_log'
      return {
        turn: clampInt(row.turn, 0, 999),
        type,
        source,
      }
    })
    .filter((x): x is JudgeSessionVerdict['penalty_events'][number] => x !== null)

  const fact_checks = factRaw
    .map((item) => {
      const row = item as Record<string, unknown>
      const status = row.status
      if (status !== 'verified' && status !== 'contradicted' && status !== 'unverified') {
        return null
      }
      return {
        turn: clampInt(row.turn, 0, 999),
        claim: typeof row.claim === 'string' ? row.claim.slice(0, 500) : '',
        status,
        fact_id: typeof row.fact_id === 'string' ? row.fact_id : null,
      }
    })
    .filter((x): x is JudgeSessionVerdict['fact_checks'][number] => x !== null && x.claim.length > 0)

  const topicsRaw = Array.isArray(data.topics_for_resource_screen)
    ? data.topics_for_resource_screen
    : []
  const topics_for_resource_screen = topicsRaw
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .slice(0, 8)

  const session_terminate = data.session_terminate === true
  const termination_reason =
    typeof data.termination_reason === 'string' ? data.termination_reason.slice(0, 200) : null

  const respect_score = clampInt(data.respect_score, 0, 100)
  const argument_quality_score = clampInt(data.argument_quality_score, 0, 100)

  let result: 'pass' | 'needs_work' = data.result === 'pass' ? 'pass' : 'needs_work'
  if (!session_terminate) {
    result = computePassFail(respect_score, argument_quality_score, penalty_events.length)
  }

  const feedback_summary =
    typeof data.feedback_summary === 'string'
      ? data.feedback_summary.slice(0, 1200)
      : 'Feedback could not be generated for this debate.'

  return {
    session_terminate,
    termination_reason,
    respect_score,
    argument_quality_score,
    penalty_events,
    fact_checks,
    result,
    feedback_summary,
    topics_for_resource_screen,
  }
}

export function computePassFail(
  respect: number,
  quality: number,
  penaltyCount: number,
): 'pass' | 'needs_work' {
  if (
    respect >= PASS_RESPECT_THRESHOLD &&
    quality >= PASS_QUALITY_THRESHOLD &&
    penaltyCount < CONDUCT_EVENTS_NEEDS_WORK
  ) {
    return 'pass'
  }
  return 'needs_work'
}

export function statusFromJudgeVerdict(verdict: JudgeSessionVerdict): {
  status: SessionStatus
  reason: SessionOutcomeReason | null
} {
  if (verdict.session_terminate) {
    const reason = terminationReasonFromText(verdict.termination_reason)
    return { status: 'lost', reason }
  }
  if (verdict.result === 'pass') {
    return { status: 'passed', reason: 'passed' }
  }
  return { status: 'needs_work', reason: 'argument_quality' }
}

function terminationReasonFromText(text: string | null): SessionOutcomeReason {
  if (!text) return 'hate_speech'
  const lower = text.toLowerCase()
  if (lower.includes('yell')) return 'yelling'
  if (lower.includes('hate') || lower.includes('slur')) return 'hate_speech'
  return 'incivility'
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
