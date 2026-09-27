import type { Side, TopicId } from './types'

export interface TopicConfig {
  id: TopicId
  label: string
  /** Neutral framing of what is being argued about. */
  question: string
  /**
   * One-sentence statements of each side, written to be equally strong. These
   * are injected into the debater and judge prompts, so the wording here is
   * the main lever for keeping the AI even-handed.
   */
  positions: Record<Side, string>
  /**
   * Overrides "left-leaning" / "right-leaning" in prompts and results copy.
   * Used for non-political daily topics (for/against propositions).
   */
  sideLabels?: Record<Side, string>
}

export const TOPICS: TopicConfig[] = [
  {
    id: 'immigration',
    label: 'Border control and immigration',
    question: 'How open or restrictive should U.S. immigration and border policy be?',
    positions: {
      left: 'Immigration policy should be more open: expand legal pathways, create a route to citizenship for long-settled unauthorized residents, and treat enforcement as a last resort rather than the centerpiece.',
      right: 'Immigration policy should be more restrictive: secure the border first, enforce existing law consistently including removals, and set immigration levels deliberately rather than by default.',
    },
  },
  {
    id: 'guns',
    label: 'Gun control',
    question: 'How much should civilian firearm ownership be regulated?',
    positions: {
      left: 'Firearms should be regulated more tightly: universal background checks, red-flag laws, and limits on the most lethal categories of weapons and magazines.',
      right: 'Firearms regulation should not be expanded: the right to armed self-defense is individual and pre-political, and the answer is enforcing existing law and addressing violence at its roots.',
    },
  },
  {
    id: 'abortion',
    label: 'Abortion',
    question: 'How should the law treat abortion?',
    positions: {
      left: 'Abortion should be legal in all or most cases, with the decision resting with the pregnant person and their doctor rather than the state.',
      right: 'Abortion should be illegal in most cases, with narrow exceptions, because the law should extend protection to the unborn.',
    },
  },
  {
    id: 'economy',
    label: 'The Trump economy',
    question: 'Has economic policy under Trump helped or hurt most American households?',
    positions: {
      left: 'Economic policy under Trump has left most households worse off: the gains concentrated at the top while tariffs and price pressure ate into ordinary paychecks.',
      right: 'Economic policy under Trump has left most households better off: deregulation and tax cuts drove growth, jobs, and wage gains that reached working families.',
    },
  },
  {
    id: 'ai',
    label: 'AI regulation',
    question: 'Should AI be regulated more tightly or left freer to develop?',
    positions: {
      left: 'AI should be regulated more tightly: require safety testing, transparency, and limits on high-risk uses before models scale, even if that slows some products.',
      right: 'AI should be left freer to develop: heavy preemptive rules favor incumbents, chill research, and cede the lead to countries that will not pause for U.S. process.',
    },
  },
  {
    id: 'taylor_swift',
    label: 'Taylor Swift',
    question: "Is Taylor Swift's impact on the music industry positive or negative?",
    sideLabels: {
      left: 'positive',
      right: 'negative',
    },
    positions: {
      left: "Taylor Swift's impact on the music industry is positive: ambitious songwriting craft, genre range, and cultural reach that expanded what mainstream pop can hold and how artists own their work.",
      right: "Taylor Swift's impact on the music industry is negative: industrial-scale branding and formula crowd out riskier art and flatten what counts as success.",
    },
  },
  {
    id: 'ai_humanity',
    label: 'AI and humanity',
    question: 'Is AI beneficial to humanity?',
    sideLabels: {
      left: 'beneficial',
      right: 'harmful or not beneficial',
    },
    positions: {
      left: 'AI is beneficial to humanity overall: it amplifies knowledge work, science, and access to tools that improve lives when governed with care.',
      right: 'AI is harmful or not beneficial overall: concentrated power, misuse, displacement, and systemic risk outweigh the convenience gains.',
    },
  },
]

/** Topics used by the diagnostic quiz (political spectrum). */
export const DIAGNOSTIC_TOPIC_IDS: TopicId[] = [
  'immigration',
  'guns',
  'abortion',
  'economy',
  'ai',
]

export const TOPIC_IDS: TopicId[] = TOPICS.map((t) => t.id)

export function getTopic(id: TopicId): TopicConfig {
  const topic = TOPICS.find((t) => t.id === id)
  if (!topic) {
    throw new Error(`Unknown topic: ${id}`)
  }
  return topic
}

export function oppositeSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left'
}

export function sideLabel(side: Side, topic?: TopicConfig | TopicId): string {
  const config =
    typeof topic === 'string' ? TOPICS.find((t) => t.id === topic) : topic
  if (config?.sideLabels?.[side]) {
    return config.sideLabels[side]
  }
  return side === 'left' ? 'left-leaning' : 'right-leaning'
}

/**
 * A lean of exactly 0 is a coin flip; the debater still needs a side to argue.
 */
export function sideFromLean(lean: number, tieBreak: () => number = Math.random): Side {
  if (lean > 0) return 'right'
  if (lean < 0) return 'left'
  return tieBreak() < 0.5 ? 'left' : 'right'
}
