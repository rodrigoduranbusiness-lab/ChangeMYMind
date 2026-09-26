import { conductCapReached, hardStopFromEventLog, interruptionLoss } from './eventLog'
import {
  WIN_PERSUASION_THRESHOLD,
  WIN_QUALITY_THRESHOLD,
  WIN_RESPECT_THRESHOLD,
} from './scoring'
import type { EventLogEntry, JudgeSessionVerdict, JudgeScores, SessionOutcomeReason } from './types'
import { computePassFail, statusFromJudgeVerdict } from './judgeVerdict'

export interface TurnDecision {
  outcome: 'continue' | 'passed' | 'needs_work' | 'lost'
  reason: SessionOutcomeReason | null
}

export interface SessionConduct {
  conductEvents: number
  conductPenaltyPoints: number
}

/**
 * @deprecated Persuasion analytics only.
 */
export function effectivePersuasion(scores: JudgeScores): number {
  return scores.gaming_detected
    ? Math.min(scores.persuasion, WIN_PERSUASION_THRESHOLD - 1)
    : scores.persuasion
}

/**
 * Mid-debate: instant loss / conduct cap only (session judge runs at finalize).
 */
export function decideOutcomeFromEvents(eventLog: EventLogEntry[] | undefined): TurnDecision {
  const hard = hardStopFromEventLog(eventLog)
  if (hard.stop && hard.reason) {
    return { outcome: 'lost', reason: hard.reason }
  }
  if (interruptionLoss(eventLog)) {
    return { outcome: 'lost', reason: 'interruptions' }
  }
  if (conductCapReached(eventLog)) {
    return { outcome: 'needs_work', reason: 'conduct_cap' }
  }
  return { outcome: 'continue', reason: null }
}

export function decideOutcomeFromVerdict(verdict: JudgeSessionVerdict): TurnDecision {
  const { status, reason } = statusFromJudgeVerdict(verdict)
  if (status === 'active') {
    return { outcome: 'continue', reason: null }
  }
  if (status === 'passed') {
    return { outcome: 'passed', reason: reason ?? 'passed' }
  }
  if (status === 'needs_work') {
    return { outcome: 'needs_work', reason: reason ?? 'argument_quality' }
  }
  return { outcome: 'lost', reason: reason ?? 'incivility' }
}

/** @deprecated Use {@link decideOutcomeFromVerdict}. */
export function decideOutcome(
  _evals: JudgeScores[],
  conduct: SessionConduct = { conductEvents: 0, conductPenaltyPoints: 0 },
): TurnDecision {
  if (conduct.conductEvents >= 3) {
    return { outcome: 'needs_work', reason: 'conduct_cap' }
  }
  return { outcome: 'continue', reason: null }
}

/** @deprecated Use session judge at finalize. */
export function decideTimedVerdict(): TurnDecision {
  return { outcome: 'needs_work', reason: 'argument_quality' }
}

/** Plain-language loss line for results / analytics (user-facing). */
export function outcomeLossSummary(
  reason: SessionOutcomeReason | null,
  status: string,
): string | null {
  if (status === 'passed' || status === 'won') {
    return null
  }
  if (status === 'needs_work') {
    return 'Respect or argument quality did not reach the pass bar before time ran out.'
  }
  if (reason === 'timeout') {
    return 'Time ran out before you met the pass bar.'
  }
  if (reason === 'hate_speech') {
    return 'Severe hate speech ended the debate immediately.'
  }
  if (reason === 'incivility') {
    return 'Offensive verbal abuse ended the debate immediately.'
  }
  if (reason === 'yelling') {
    return 'Sustained yelling ended the debate immediately.'
  }
  if (reason === 'interruptions') {
    return 'Too many interruptions or overlong turns (four strikes).'
  }
  if (reason === 'conduct_cap') {
    return 'Too many respect penalties in one session.'
  }
  if (reason === 'argument_quality') {
    return 'Argument quality or respect scores did not meet the pass threshold.'
  }
  if (reason === 'abandoned' || status === 'abandoned') {
    return 'The session ended before the debate finished.'
  }
  if (status === 'lost') {
    return 'The debate ended without meeting the pass thresholds.'
  }
  return null
}

export function outcomeDescription(
  status: string,
  reason: SessionOutcomeReason | null,
): string {
  if (status === 'passed' || status === 'won') {
    return 'The user met the respect and quality bar before time ran out.'
  }
  if (status === 'needs_work') {
    return 'The debate finished, but the user should rematch this topic after review.'
  }
  if (status === 'abandoned' || reason === 'abandoned') {
    return 'The user left before the debate finished, so it is incomplete.'
  }
  if (reason === 'hate_speech') {
    return 'The debate stopped immediately because of severe hate speech.'
  }
  if (reason === 'incivility') {
    return 'The debate stopped immediately because of offensive cursing or verbal abuse.'
  }
  if (reason === 'yelling') {
    return 'The debate stopped immediately because of sustained yelling.'
  }
  if (reason === 'conduct_cap') {
    return 'Too many respect penalties in one session.'
  }
  if (reason === 'interruptions') {
    return 'The debate ended because of too many interruptions or overlong turns.'
  }
  return 'The debate ended without meeting the pass thresholds.'
}

export function normalizeSessionStatus(
  status: string,
): 'passed' | 'needs_work' | 'lost' | 'abandoned' | 'active' {
  if (status === 'won') {
    return 'passed'
  }
  if (
    status === 'passed' ||
    status === 'needs_work' ||
    status === 'lost' ||
    status === 'abandoned' ||
    status === 'active'
  ) {
    return status
  }
  return 'lost'
}

export { WIN_RESPECT_THRESHOLD, WIN_QUALITY_THRESHOLD, computePassFail }
