import {
  INCIVILITY_SCORE_THRESHOLD,
  INCIVILITY_STRIKES_TO_LOSE,
  WIN_PERSUASION_THRESHOLD,
} from './scoring'
import type { JudgeScores, SessionOutcomeReason } from './types'

export interface TurnDecision {
  outcome: 'continue' | 'won' | 'lost'
  reason: SessionOutcomeReason | null
}

/**
 * A detected manipulation attempt can never be the thing that crosses the win
 * line. The judge is already told not to reward gaming; this is the backstop
 * that makes it structurally impossible.
 */
export function effectivePersuasion(scores: JudgeScores): number {
  return scores.gaming_detected
    ? Math.min(scores.persuasion, WIN_PERSUASION_THRESHOLD - 1)
    : scores.persuasion
}

/**
 * Decides whether the debate is over, given every evaluation so far in order.
 *
 * Pure on purpose: this is the rule that decides a win, so it is unit tested
 * without Firestore or Gemini in the way. Only ever called server-side.
 */
export function decideOutcome(evals: JudgeScores[]): TurnDecision {
  if (!evals.length) {
    return { outcome: 'continue', reason: null }
  }

  const latest = evals[evals.length - 1]
  if (effectivePersuasion(latest) >= WIN_PERSUASION_THRESHOLD) {
    return { outcome: 'won', reason: 'persuaded' }
  }

  // Consecutive strikes only: one civil turn clears the count.
  let strikes = 0
  for (let i = evals.length - 1; i >= 0; i--) {
    if (evals[i].civility_tone <= INCIVILITY_SCORE_THRESHOLD) {
      strikes++
    } else {
      break
    }
  }
  if (strikes >= INCIVILITY_STRIKES_TO_LOSE) {
    return { outcome: 'lost', reason: 'incivility' }
  }

  return { outcome: 'continue', reason: null }
}

export function outcomeDescription(
  status: string,
  reason: SessionOutcomeReason | null,
): string {
  if (status === 'won') {
    return "The user changed the debater's mind before time ran out."
  }
  if (status === 'abandoned' || reason === 'abandoned') {
    return 'The user left before the debate finished, so it is incomplete.'
  }
  if (reason === 'incivility') {
    return 'The debate was stopped early because the conversation turned hostile.'
  }
  return "Time ran out without the user changing the debater's mind."
}
