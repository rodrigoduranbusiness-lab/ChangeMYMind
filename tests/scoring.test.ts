import { describe, expect, it } from 'vitest'

import {
  angleFromLean,
  buildResults,
  conversationComponent,
  diagnosticComponent,
  polarizationScore,
  polarToCartesian,
} from '../shared/scoring'
import type { DiagnosticResult, JudgeScores, TopicId } from '../shared/types'

function diagnostic(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  const leans: Record<TopicId, number> = {
    immigration: 0.5,
    guns: 0.5,
    abortion: 0.5,
    economy: 0.5,
    ai: 0.5,
    taylor_swift: 0,
    ai_humanity: 0,
  }
  const extremity: Record<TopicId, number> = {
    immigration: 0.5,
    guns: 0.5,
    abortion: 0.5,
    economy: 0.5,
    ai: 0.5,
    taylor_swift: 0,
    ai_humanity: 0,
  }

  return {
    answers: [],
    topicLeans: leans,
    topicExtremity: extremity,
    openness: 0.5,
    assignedTopic: 'guns',
    ...overrides,
  }
}

function scores(overrides: Partial<JudgeScores> = {}): JudgeScores {
  return {
    evidence_reasoning: 5,
    civility_tone: 5,
    acknowledges_tradeoffs: 5,
    addresses_ai_points: 5,
    persuasion: 50,
    gaming_detected: false,
    rationale: '',
    ...overrides,
  }
}

describe('diagnosticComponent', () => {
  it('is the average extremity when openness is neutral', () => {
    expect(diagnosticComponent(diagnostic())).toBe(0.5)
  })

  it('lowers the score for an open-minded user holding the same views', () => {
    expect(diagnosticComponent(diagnostic({ openness: 1 }))).toBeCloseTo(0.3, 5)
  })

  it('raises the score for a closed-minded user holding the same views', () => {
    expect(diagnosticComponent(diagnostic({ openness: 0 }))).toBeCloseTo(0.7, 5)
  })

  it('stays within 0…1 at the extremes', () => {
    const maxed = diagnostic({
      topicExtremity: {
        immigration: 1,
        guns: 1,
        abortion: 1,
        economy: 1,
        ai: 1,
        taylor_swift: 0,
        ai_humanity: 0,
      },
      openness: 0,
    })
    expect(diagnosticComponent(maxed)).toBe(1)

    const minimal = diagnostic({
      topicExtremity: {
        immigration: 0,
        guns: 0,
        abortion: 0,
        economy: 0,
        ai: 0,
        taylor_swift: 0,
        ai_humanity: 0,
      },
      openness: 1,
    })
    expect(diagnosticComponent(minimal)).toBe(0)
  })
})

describe('conversationComponent', () => {
  it('is neutral when there is nothing to judge', () => {
    expect(conversationComponent([])).toBe(0.5)
  })

  it('is the inverse of tradeoffs, civility, and engagement', () => {
    expect(
      conversationComponent([
        scores({ acknowledges_tradeoffs: 10, civility_tone: 10, addresses_ai_points: 10 }),
      ]),
    ).toBe(0)

    expect(
      conversationComponent([
        scores({ acknowledges_tradeoffs: 0, civility_tone: 0, addresses_ai_points: 0 }),
      ]),
    ).toBe(1)
  })

  it('ignores persuasion and evidence, which measure skill rather than openness', () => {
    const base = { acknowledges_tradeoffs: 5, civility_tone: 5, addresses_ai_points: 5 }
    const low = conversationComponent([scores({ ...base, persuasion: 0, evidence_reasoning: 0 })])
    const high = conversationComponent([
      scores({ ...base, persuasion: 100, evidence_reasoning: 10 }),
    ])
    expect(low).toBe(high)
  })

  it('averages across every evaluation', () => {
    const value = conversationComponent([
      scores({ acknowledges_tradeoffs: 10, civility_tone: 10, addresses_ai_points: 10 }),
      scores({ acknowledges_tradeoffs: 0, civility_tone: 0, addresses_ai_points: 0 }),
    ])
    expect(value).toBeCloseTo(0.5, 5)
  })
})

describe('polarizationScore', () => {
  it('weights the diagnostic and the conversation equally', () => {
    expect(polarizationScore(1, 0)).toBe(0.5)
    expect(polarizationScore(0, 1)).toBe(0.5)
    expect(polarizationScore(0.8, 0.4)).toBeCloseTo(0.6, 5)
  })
})

describe('angleFromLean', () => {
  it('puts a full right lean due east and a full left lean due west', () => {
    expect(angleFromLean(1)).toBe(0)
    expect(angleFromLean(-1)).toBe(180)
  })

  it('puts no lean straight up', () => {
    expect(angleFromLean(0)).toBe(90)
  })

  it('keeps right leans in the right half and left leans in the left half', () => {
    expect(angleFromLean(0.3)).toBeLessThan(90)
    expect(angleFromLean(-0.3)).toBeGreaterThan(90)
  })

  it('is symmetric, so neither side is pushed further out', () => {
    for (const lean of [0.2, 0.5, 0.9]) {
      expect(90 - angleFromLean(lean)).toBeCloseTo(angleFromLean(-lean) - 90, 5)
    }
  })
})

describe('polarToCartesian', () => {
  it('places the center at zero radius', () => {
    expect(polarToCartesian(100, 100, 0, 90)).toEqual({ x: 100, y: 100 })
  })

  it('flips y so 90 degrees points up', () => {
    const up = polarToCartesian(100, 100, 50, 90)
    expect(up.y).toBeCloseTo(50, 5)
    expect(up.x).toBeCloseTo(100, 5)
  })

  it('places 0 degrees to the east', () => {
    const east = polarToCartesian(100, 100, 50, 0)
    expect(east.x).toBeCloseTo(150, 5)
    expect(east.y).toBeCloseTo(100, 5)
  })
})

describe('buildResults', () => {
  it('uses the assigned topic lean for the angle and the score for the radius', () => {
    const results = buildResults({
      diagnostic: diagnostic({
        topicLeans: {
          immigration: 0.2,
          guns: -0.8,
          abortion: 0,
          economy: 0.4,
          ai: 0.1,
          taylor_swift: 0,
          ai_humanity: 0,
        },
        assignedTopic: 'guns',
      }),
      evals: [scores()],
      assignedTopic: 'guns',
      takeaways: ['a', 'b'],
    })

    expect(results.angle).toBe(angleFromLean(-0.8))
    expect(results.radius).toBe(results.polarizationScore)
    expect(results.topicPoints).toHaveLength(7)
    expect(results.takeaways).toEqual(['a', 'b'])
  })

  it('carries the final evaluation through for the breakdown', () => {
    const results = buildResults({
      diagnostic: diagnostic(),
      evals: [scores({ persuasion: 10 }), scores({ persuasion: 72 })],
      assignedTopic: 'guns',
      takeaways: [],
    })

    expect(results.finalScores?.persuasion).toBe(72)
  })

  it('reports no final scores when the debate was never judged', () => {
    const results = buildResults({
      diagnostic: diagnostic(),
      evals: [],
      assignedTopic: 'guns',
      takeaways: [],
    })

    expect(results.finalScores).toBeNull()
  })
})
