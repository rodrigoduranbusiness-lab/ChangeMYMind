import bank from './fact-bank.json'
import type { TopicId } from './types'

export type FactCitedBy = 'left' | 'right' | 'neutral'

export interface VerifiedFact {
  id: string
  claim: string
  source: string
  cited_by: FactCitedBy
}

export interface FactResourceLink {
  title: string
  url: string
}

export interface TopicResources {
  left_1: FactResourceLink
  left_2: FactResourceLink
  right_1: FactResourceLink
  right_2: FactResourceLink
  neutral: FactResourceLink
}

export interface TopicFactSheet {
  neutral_framing: string
  facts: VerifiedFact[]
  resources: TopicResources
}

const sheets = bank.topics as Record<TopicId, TopicFactSheet>

/** JSON injected into judge and opponent prompts as TOPIC_FACT_BANK. */
export function getTopicFactBankJson(topicId: TopicId): string {
  const sheet = getTopicFactSheet(topicId)
  return JSON.stringify(
    {
      neutral_framing: sheet.neutral_framing,
      facts: sheet.facts,
    },
    null,
    2,
  )
}

export function getTopicFactSheet(topicId: TopicId): TopicFactSheet {
  const sheet = sheets[topicId]
  if (!sheet) {
    throw new Error(`No fact sheet for topic "${topicId}"`)
  }
  return sheet
}

/** Plain-text block injected into debater, judge, and takeaways prompts. */
export function formatFactBankForPrompt(topicId: TopicId): string {
  const sheet = getTopicFactSheet(topicId)
  const lines: string[] = [
    sheet.neutral_framing,
    '',
    'Verified facts (you may ONLY treat these as established for this debate):',
  ]

  for (const fact of sheet.facts) {
    lines.push(
      `- [${fact.id}] ${fact.claim} (Source: ${fact.source}; often cited by ${fact.cited_by} side)`,
    )
  }

  return lines.join('\n')
}

export function getTopicResources(topicId: TopicId): TopicResources {
  return getTopicFactSheet(topicId).resources
}

export function listResourceLinks(topicId: TopicId): Array<FactResourceLink & { role: string }> {
  const r = getTopicResources(topicId)
  return [
    { role: 'Left-leaning case', ...r.left_1 },
    { role: 'Left-leaning case', ...r.left_2 },
    { role: 'Right-leaning case', ...r.right_1 },
    { role: 'Right-leaning case', ...r.right_2 },
    { role: 'Balanced overview', ...r.neutral },
  ]
}
