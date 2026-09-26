import { TOPIC_IDS } from './topics'
import type { DiagnosticAnswer, DiagnosticResult, TopicId } from './types'

/**
 * A 1-5 agree/disagree statement.
 *
 * For topic questions, `agreeLean` says which direction agreement points. Each
 * topic gets one statement where agreeing leans left and one where agreeing
 * leans right, so a user who just picks "agree" for everything scores as
 * centrist rather than as whichever side we happened to phrase first.
 */
export interface DiagnosticQuestion {
  id: string
  statement: string
  kind: 'topic' | 'openness'
  topic?: TopicId
  agreeLean?: 'left' | 'right'
}

export const SCALE_MIN = 1
export const SCALE_MAX = 5

export const SCALE_LABELS = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree',
]

export const DIAGNOSTIC_QUESTIONS: DiagnosticQuestion[] = [
  {
    id: 'immigration_right',
    kind: 'topic',
    topic: 'immigration',
    agreeLean: 'right',
    statement:
      'U.S. immigration policy should prioritize stronger border enforcement and removals over expanding paths to legal status.',
  },
  {
    id: 'immigration_left',
    kind: 'topic',
    topic: 'immigration',
    agreeLean: 'left',
    statement:
      'Long-term unauthorized residents should have a path to legal status rather than face removal.',
  },
  {
    id: 'guns_left',
    kind: 'topic',
    topic: 'guns',
    agreeLean: 'left',
    statement:
      'Civilian firearm ownership should be regulated more tightly than it is today.',
  },
  {
    id: 'guns_right',
    kind: 'topic',
    topic: 'guns',
    agreeLean: 'right',
    statement:
      'Civilian firearm ownership should not face new restrictions beyond existing law.',
  },
  {
    id: 'abortion_left',
    kind: 'topic',
    topic: 'abortion',
    agreeLean: 'left',
    statement:
      'Abortion should be legal in most cases, with the decision left to the pregnant person and their doctor.',
  },
  {
    id: 'economy_right',
    kind: 'topic',
    topic: 'economy',
    agreeLean: 'right',
    statement:
      'Economic policy since early 2025 has left most ordinary households better off.',
  },
  {
    id: 'ai_left',
    kind: 'topic',
    topic: 'ai',
    agreeLean: 'left',
    statement:
      'Governments should require safety testing and limits on high-risk AI uses before powerful systems are widely deployed.',
  },
  {
    id: 'ai_right',
    kind: 'topic',
    topic: 'ai',
    agreeLean: 'right',
    statement:
      'AI development should face few new preemptive rules so progress and competition are not slowed.',
  },
  {
    id: 'openness_reasonable',
    kind: 'openness',
    statement:
      'On a heated political issue, I can usually see why a reasonable person might disagree with me.',
  },
  {
    id: 'openness_changed_mind',
    kind: 'openness',
    statement:
      'I have changed my mind on at least one political issue after hearing a strong opposing argument.',
  },
]

/** Fisher–Yates shuffle for presentation order (scoring still uses question ids). */
export function shuffleQuestionOrder(
  length: number,
  random: () => number = Math.random,
): number[] {
  const order = Array.from({ length }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

export const DIAGNOSTIC_LENGTH = DIAGNOSTIC_QUESTIONS.length

export function getQuestion(id: string): DiagnosticQuestion {
  const question = DIAGNOSTIC_QUESTIONS.find((q) => q.id === id)
  if (!question) {
    throw new Error(`Unknown diagnostic question: ${id}`)
  }
  return question
}

/** Maps a 1-5 answer onto -1 (strongly disagree) … +1 (strongly agree). */
export function normalizeAgreement(value: number): number {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))
  return (clamped - 3) / 2
}

/** Maps a 1-5 answer onto 0 … 1, used for the openness questions. */
export function normalizeOpenness(value: number): number {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, value))
  return (clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)
}

/**
 * Scores a completed diagnostic.
 *
 * Per topic, both statements are converted to a signed lean and averaged, so
 * the two phrasings cancel out acquiescence bias. The user is routed to the
 * topic they hold most strongly, with random tie-breaking.
 */
export function scoreDiagnostic(
  answers: DiagnosticAnswer[],
  tieBreak: () => number = Math.random,
): DiagnosticResult {
  const byId = new Map(answers.map((a) => [a.questionId, a.value]))

  const topicLeans = {} as Record<TopicId, number>
  const topicExtremity = {} as Record<TopicId, number>

  for (const topic of TOPIC_IDS) {
    const questions = DIAGNOSTIC_QUESTIONS.filter(
      (q) => q.kind === 'topic' && q.topic === topic,
    )

    const leans: number[] = []
    for (const question of questions) {
      const value = byId.get(question.id)
      if (value === undefined) continue
      const agreement = normalizeAgreement(value)
      // Agreeing with a right-phrased statement pushes right; agreeing with a
      // left-phrased statement pushes left.
      leans.push(question.agreeLean === 'right' ? agreement : -agreement)
    }

    const lean = leans.length ? leans.reduce((a, b) => a + b, 0) / leans.length : 0
    topicLeans[topic] = round3(lean)
    topicExtremity[topic] = round3(Math.abs(lean))
  }

  const opennessValues = DIAGNOSTIC_QUESTIONS.filter((q) => q.kind === 'openness')
    .map((q) => byId.get(q.id))
    .filter((v): v is number => v !== undefined)
    .map(normalizeOpenness)

  const openness = opennessValues.length
    ? round3(opennessValues.reduce((a, b) => a + b, 0) / opennessValues.length)
    : 0.5

  return {
    answers,
    topicLeans,
    topicExtremity,
    openness,
    assignedTopic: pickAssignedTopic(topicExtremity, tieBreak),
  }
}

/**
 * Routes to the topic where the user’s views are most decisive.
 * Near-ties (within 0.12 extremity) stay in the pool so routing feels less
 * mechanical when two issues land close together.
 */
export function pickAssignedTopic(
  topicExtremity: Record<TopicId, number>,
  tieBreak: () => number = Math.random,
): TopicId {
  let best = -1
  for (const topic of TOPIC_IDS) {
    best = Math.max(best, topicExtremity[topic] ?? 0)
  }

  const NEAR_TIE = 0.12
  const contenders = TOPIC_IDS.filter(
    (topic) => best - (topicExtremity[topic] ?? 0) <= NEAR_TIE + 1e-9,
  )

  return contenders[Math.floor(tieBreak() * contenders.length) % contenders.length]
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
