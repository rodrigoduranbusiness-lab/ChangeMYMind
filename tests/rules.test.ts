import { describe, expect, it } from 'vitest'

import { decideOutcome, effectivePersuasion } from '../shared/rules'
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
  it('passes real scores through untouched', () => {
    expect(effectivePersuasion(scores({ persuasion: 91 }))).toBe(91)
  })

  it('caps a gaming attempt just below the win threshold', () => {
    const capped = effectivePersuasion(scores({ persuasion: 100, gaming_detected: true }))
    expect(capped).toBe(WIN_PERSUASION_THRESHOLD - 1)
    expect(capped).toBeLessThan(WIN_PERSUASION_THRESHOLD)
  })

  it('does not inflate a low score just because gaming was detected', () => {
    expect(effectivePersuasion(scores({ persuasion: 10, gaming_detected: true }))).toBe(10)
  })
})

describe('decideOutcome', () => {
  it('continues with no evaluations yet', () => {
    expect(decideOutcome([])).toEqual({ outcome: 'continue', reason: null })
  })

  it('wins at exactly the threshold', () => {
    expect(decideOutcome([scores({ persuasion: WIN_PERSUASION_THRESHOLD })])).toEqual({
      outcome: 'won',
      reason: 'persuaded',
    })
  })

  it('does not win one point below the threshold', () => {
    expect(decideOutcome([scores({ persuasion: WIN_PERSUASION_THRESHOLD - 1 })]).outcome).toBe(
      'continue',
    )
  })

  it('cannot be won by gaming, however high the raw persuasion', () => {
    expect(decideOutcome([scores({ persuasion: 100, gaming_detected: true })]).outcome).toBe(
      'continue',
    )
  })

  it('loses after two consecutive incivility strikes', () => {
    expect(
      decideOutcome([scores({ civility_tone: 2 }), scores({ civility_tone: 1 })]),
    ).toEqual({ outcome: 'lost', reason: 'incivility' })
  })

  it('does not lose on a single strike', () => {
    expect(decideOutcome([scores({ civility_tone: 1 })]).outcome).toBe('continue')
  })

  it('clears the strike count after a civil turn', () => {
    const evals = [
      scores({ civility_tone: 1 }),
      scores({ civility_tone: 7 }),
      scores({ civility_tone: 2 }),
    ]
    expect(decideOutcome(evals).outcome).toBe('continue')
  })

  it('treats civility of 3 as civil enough', () => {
    expect(
      decideOutcome([scores({ civility_tone: 3 }), scores({ civility_tone: 3 })]).outcome,
    ).toBe('continue')
  })

  it('prefers a win over an incivility loss on the same turn', () => {
    const evals = [
      scores({ civility_tone: 1 }),
      scores({ civility_tone: 1, persuasion: 95 }),
    ]
    expect(decideOutcome(evals)).toEqual({ outcome: 'won', reason: 'persuaded' })
  })
})
