import { describe, expect, it } from 'vitest'

import { CONDUCT_EVENTS_NEEDS_WORK, INTERRUPTIONS_TO_LOSE } from '../shared/conduct'
import { appendEventLog } from '../shared/eventLog'
import { computePassFail, normalizeJudgeVerdict } from '../shared/judgeVerdict'
import { decideOutcomeFromEvents, effectivePersuasion } from '../shared/rules'
import { WIN_PERSUASION_THRESHOLD } from '../shared/scoring'
import type { JudgeScores } from '../shared/types'

function scores(overrides: Partial<JudgeScores> = {}): JudgeScores {
  return {
    evidence_reasoning: 6,
    civility_tone: 7,
    acknowledges_tradeoffs: 6,
    addresses_ai_points: 6,
    persuasion: 50,
    gaming_detected: false,
    rationale: '',
    ...overrides,
  }
}

describe('effectivePersuasion', () => {
  it('caps gaming attempts below the legacy persuasion cap', () => {
    expect(effectivePersuasion(scores({ persuasion: 100, gaming_detected: true }))).toBe(
      WIN_PERSUASION_THRESHOLD - 1,
    )
  })
})

describe('decideOutcomeFromEvents', () => {
  it('continues with an empty event log', () => {
    expect(decideOutcomeFromEvents([])).toEqual({ outcome: 'continue', reason: null })
  })

  it('loses on hate speech in the event log', () => {
    const log = appendEventLog([], {
      turn: 1,
      type: 'hate_speech',
      source: 'event_log',
    })
    expect(decideOutcomeFromEvents(log)).toEqual({ outcome: 'lost', reason: 'hate_speech' })
  })

  it('loses on directed offensive cursing (toxicity)', () => {
    const log = appendEventLog([], {
      turn: 1,
      type: 'toxicity',
      source: 'event_log',
    })
    expect(decideOutcomeFromEvents(log)).toEqual({ outcome: 'lost', reason: 'incivility' })
  })

  it('loses on four interruption events', () => {
    let log = appendEventLog([], { turn: 1, type: 'interruption', source: 'event_log' })
    for (let i = 0; i < INTERRUPTIONS_TO_LOSE - 1; i++) {
      log = appendEventLog(log, { turn: 1, type: 'interruption', source: 'event_log' })
    }
    expect(decideOutcomeFromEvents(log)).toEqual({ outcome: 'lost', reason: 'interruptions' })
  })

  it('needs work when conduct cap penalty events are logged (non-interruption strikes)', () => {
    let log = appendEventLog([], { turn: 1, type: 'insult', source: 'event_log' })
    for (let i = 0; i < CONDUCT_EVENTS_NEEDS_WORK - 1; i++) {
      log = appendEventLog(log, { turn: 1, type: 'insult', source: 'event_log' })
    }
    expect(decideOutcomeFromEvents(log)).toEqual({ outcome: 'needs_work', reason: 'conduct_cap' })
  })
})

describe('normalizeJudgeVerdict / pass threshold', () => {
  it('passes when both axes clear 70 and penalties are under 3', () => {
    const verdict = normalizeJudgeVerdict({
      session_terminate: false,
      termination_reason: null,
      respect_score: 80,
      argument_quality_score: 75,
      penalty_events: [{ turn: 1, type: 'interruption', source: 'event_log' }],
      fact_checks: [],
      result: 'needs_work',
      feedback_summary: 'Solid engagement.',
      topics_for_resource_screen: ['gc1'],
    })
    expect(verdict.result).toBe('pass')
    expect(computePassFail(80, 75, 1)).toBe('pass')
  })
})
