import { describe, expect, it } from 'vitest'

import {
  DIAGNOSTIC_QUESTIONS,
  normalizeAgreement,
  pickAssignedTopic,
  scoreDiagnostic,
  shuffleQuestionOrder,
} from '../shared/diagnostic'
import { DIAGNOSTIC_TOPIC_IDS } from '../shared/topics'
import type { DiagnosticAnswer, TopicId } from '../shared/types'

/** Answers every question with the same value. */
function uniformAnswers(value: number): DiagnosticAnswer[] {
  return DIAGNOSTIC_QUESTIONS.map((q) => ({ questionId: q.id, value }))
}

function answersFor(overrides: Record<string, number>, fallback = 3): DiagnosticAnswer[] {
  return DIAGNOSTIC_QUESTIONS.map((q) => ({
    questionId: q.id,
    value: overrides[q.id] ?? fallback,
  }))
}

describe('question set', () => {
  it('has paired topic questions except abortion and economy (one each)', () => {
    for (const topic of DIAGNOSTIC_TOPIC_IDS) {
      const questions = DIAGNOSTIC_QUESTIONS.filter(
        (q) => q.kind === 'topic' && q.topic === topic,
      )
      if (topic === 'abortion' || topic === 'economy') {
        expect(questions).toHaveLength(1)
      } else {
        expect(questions).toHaveLength(2)
        expect(questions.map((q) => q.agreeLean).sort()).toEqual(['left', 'right'])
      }
    }
  })

  it('is ten questions: eight topic plus two openness', () => {
    expect(DIAGNOSTIC_QUESTIONS).toHaveLength(10)
    expect(DIAGNOSTIC_QUESTIONS.filter((q) => q.kind === 'openness')).toHaveLength(2)
  })
})

describe('shuffleQuestionOrder', () => {
  it('returns a permutation of all indices', () => {
    const order = shuffleQuestionOrder(10, () => 0.5)
    expect(order).toHaveLength(10)
    expect(new Set(order).size).toBe(10)
  })
})

describe('normalizeAgreement', () => {
  it('maps the 1-5 scale onto -1…+1 with 3 as neutral', () => {
    expect(normalizeAgreement(1)).toBe(-1)
    expect(normalizeAgreement(3)).toBe(0)
    expect(normalizeAgreement(5)).toBe(1)
  })

  it('clamps out-of-range input', () => {
    expect(normalizeAgreement(0)).toBe(-1)
    expect(normalizeAgreement(9)).toBe(1)
  })
})

describe('scoreDiagnostic', () => {
  it('cancels acquiescence bias on paired topics: agreeing with everything reads as centrist', () => {
    for (const value of [1, 2, 4, 5]) {
      const result = scoreDiagnostic(uniformAnswers(value))
      for (const topic of ['immigration', 'guns', 'ai'] as TopicId[]) {
        expect(result.topicLeans[topic]).toBe(0)
        expect(result.topicExtremity[topic]).toBe(0)
      }
    }
  })

  it('scores a consistently right-leaning user as positive lean', () => {
    const result = scoreDiagnostic(
      answersFor({
        immigration_right: 5,
        immigration_left: 1,
        guns_right: 5,
        guns_left: 1,
        abortion_left: 1,
        economy_right: 5,
        ai_right: 5,
        ai_left: 1,
      }),
    )

    for (const topic of DIAGNOSTIC_TOPIC_IDS) {
      expect(result.topicLeans[topic]).toBe(1)
      expect(result.topicExtremity[topic]).toBe(1)
    }
  })

  it('scores a consistently left-leaning user as negative lean, symmetrically', () => {
    const result = scoreDiagnostic(
      answersFor({
        immigration_right: 1,
        immigration_left: 5,
        guns_right: 1,
        guns_left: 5,
        abortion_left: 5,
        economy_right: 1,
        ai_right: 1,
        ai_left: 5,
      }),
    )

    for (const topic of DIAGNOSTIC_TOPIC_IDS) {
      expect(result.topicLeans[topic]).toBe(-1)
      expect(result.topicExtremity[topic]).toBe(1)
    }
  })

  it('routes to the topic with the highest extremity', () => {
    const result = scoreDiagnostic(
      answersFor({
        // Strong on guns, mild elsewhere.
        guns_right: 5,
        guns_left: 1,
        immigration_right: 4,
        immigration_left: 3,
      }),
    )

    expect(result.assignedTopic).toBe('guns')
  })

  it('derives openness from the openness questions', () => {
    const open = scoreDiagnostic(
      answersFor({ openness_reasonable: 5, openness_changed_mind: 5 }),
    )
    const closed = scoreDiagnostic(
      answersFor({ openness_reasonable: 1, openness_changed_mind: 1 }),
    )

    expect(open.openness).toBe(1)
    expect(closed.openness).toBe(0)
  })
})

describe('pickAssignedTopic', () => {
  const extremity = (values: Partial<Record<TopicId, number>>) =>
    ({
      immigration: 0,
      guns: 0,
      abortion: 0,
      economy: 0,
      ai: 0,
      ...values,
    }) as Record<TopicId, number>

  it('picks the single highest', () => {
    expect(pickAssignedTopic(extremity({ abortion: 0.75, guns: 0.5 }))).toBe('abortion')
  })

  it('breaks exact ties randomly among near-tied topics', () => {
    const tied = extremity({ guns: 0.5, economy: 0.5, abortion: 0.1 })

    expect(pickAssignedTopic(tied, () => 0)).toBe('guns')
    expect(pickAssignedTopic(tied, () => 0.99)).toBe('economy')
  })

  it('includes topics within 0.12 extremity of the leader in the tie pool', () => {
    const pool = extremity({ guns: 0.5, economy: 0.42, abortion: 0.1 })
    const picks = new Set<TopicId>()
    for (let i = 0; i < 30; i++) {
      picks.add(pickAssignedTopic(pool, () => i / 30))
    }
    expect(picks.has('guns')).toBe(true)
    expect(picks.has('economy')).toBe(true)
    expect(picks.has('abortion')).toBe(false)
  })

  it('still returns a topic when every extremity is zero', () => {
    expect(DIAGNOSTIC_TOPIC_IDS).toContain(pickAssignedTopic(extremity({}), () => 0.5))
  })
})
