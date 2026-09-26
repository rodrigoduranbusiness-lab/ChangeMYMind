import { TOPIC_IDS } from './topics'
import type { DiagnosticResult, JudgeScores, SessionResults, TopicId } from './types'

// --- Win / lose thresholds (the tunable rules of the game) ------------------

/** Debate length in milliseconds. */
export const DEBATE_DURATION_MS = 6 * 60 * 1000

/** Persuasion at or above this ends the session as a win. */
export const WIN_PERSUASION_THRESHOLD = 80

/** civility_tone at or below this counts as an incivility strike. */
export const INCIVILITY_SCORE_THRESHOLD = 2

/** Consecutive incivility strikes that end the session as a loss. */
export const INCIVILITY_STRIKES_TO_LOSE = 2

/** Grace period for a judge call that races the deadline. */
export const LATE_TURN_GRACE_MS = 2_000

/** Longest total pause we will credit back for connection drops. */
export const MAX_PAUSE_CREDIT_MS = 60_000

/** Upper bound on judge calls per session, as basic abuse protection. */
export const MAX_JUDGE_EVALS = 40

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * How polarized the diagnostic alone says the user is.
 *
 * Starts from the average extremity across all four topics, then nudges by up
 * to ±0.2 based on the openness questions: someone who holds strong views but
 * genuinely grants that others may be reasonable is less polarized than
 * someone who holds the same views and does not.
 */
export function diagnosticComponent(diagnostic: DiagnosticResult): number {
  const extremities = TOPIC_IDS.map((t) => diagnostic.topicExtremity[t] ?? 0)
  const avgExtremity = extremities.reduce((a, b) => a + b, 0) / (extremities.length || 1)
  const opennessAdjustment = (0.5 - (diagnostic.openness ?? 0.5)) * 0.4
  return clamp01(avgExtremity + opennessAdjustment)
}

/**
 * How polarized the user's actual debate behavior was.
 *
 * Inverse of how well they acknowledged tradeoffs, stayed civil, and engaged
 * with what the AI actually said. Persuasion and evidence are deliberately
 * excluded: they measure debating skill, not open-mindedness.
 */
export function conversationComponent(evals: JudgeScores[]): number {
  if (!evals.length) {
    // No judged turns means no evidence either way; stay neutral rather than
    // punishing or rewarding silence.
    return 0.5
  }

  const perEval = evals.map(
    (e) =>
      (clampScore(e.acknowledges_tradeoffs) +
        clampScore(e.civility_tone) +
        clampScore(e.addresses_ai_points)) /
      3,
  )

  const avg = perEval.reduce((a, b) => a + b, 0) / perEval.length
  return clamp01(1 - avg / 10)
}

/** 0 = perfectly open-minded, 1 = maximally polarized. */
export function polarizationScore(diagnostic: number, conversation: number): number {
  return clamp01(0.5 * diagnostic + 0.5 * conversation)
}

/**
 * Maps a lean onto an angle on the circle.
 *
 * 0° is due east (fully right), 180° is due west (fully left), and 90° is
 * straight up (no lean). Monotonic in lean, so right-leaning points always
 * land in the right half and left-leaning points in the left half.
 */
export function angleFromLean(lean: number): number {
  const clamped = Math.min(1, Math.max(-1, lean))
  return 90 - clamped * 90
}

export interface BuildResultsInput {
  diagnostic: DiagnosticResult
  evals: JudgeScores[]
  assignedTopic: TopicId
  takeaways: string[]
}

export function buildResults(input: BuildResultsInput): SessionResults {
  const diagnostic = diagnosticComponent(input.diagnostic)
  const conversation = conversationComponent(input.evals)
  const score = polarizationScore(diagnostic, conversation)
  const lean = input.diagnostic.topicLeans[input.assignedTopic] ?? 0

  return {
    polarizationScore: round3(score),
    angle: round3(angleFromLean(lean)),
    radius: round3(score),
    diagnosticComponent: round3(diagnostic),
    conversationComponent: round3(conversation),
    takeaways: input.takeaways,
    topicPoints: TOPIC_IDS.map((topic) => ({
      topic,
      angle: round3(angleFromLean(input.diagnostic.topicLeans[topic] ?? 0)),
      radius: round3(clamp01(input.diagnostic.topicExtremity[topic] ?? 0)),
    })),
    finalScores: input.evals.length ? (input.evals[input.evals.length - 1] as JudgeScores) : null,
  }
}

/** Polar to SVG cartesian, with y flipped so 90° points up. */
export function polarToCartesian(
  cx: number,
  cy: number,
  radiusPx: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: cx + radiusPx * Math.cos(rad),
    y: cy - radiusPx * Math.sin(rad),
  }
}

function clampScore(n: number): number {
  return Math.min(10, Math.max(0, Number.isFinite(n) ? n : 0))
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
