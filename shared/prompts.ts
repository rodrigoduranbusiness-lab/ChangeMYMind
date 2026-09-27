import { debateTimeLimitMinutes } from './debateConfig'
import { formatFactBankForPrompt, getTopicFactBankJson } from './factBank'
import { EMPTY_HUEY_CONTEXT } from './huey'
import { getTopic, oppositeSide, sideLabel } from './topics'
import type { Side, TopicId } from './types'

/**
 * Each file in /prompts starts with a block of notes for whoever is tuning it,
 * followed by a `---` line. Only what comes after that line is sent to the
 * model, so reviewers can annotate freely without changing model behavior.
 */
export function stripPromptPreamble(raw: string): string {
  const lines = raw.split('\n')
  const dividerIndex = lines.findIndex((line) => line.trim() === '---')
  if (dividerIndex === -1) {
    return raw.trim()
  }
  return lines.slice(dividerIndex + 1).join('\n').trim()
}

export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = values[key]
    if (value === undefined) {
      throw new Error(`Prompt placeholder {{${key}}} was not provided`)
    }
    return value
  })
}

/**
 * Context for takeaways / legacy prompts that still reference both sides.
 */
export function debateContext(topicId: TopicId, debaterSide: Side): Record<string, string> {
  const topic = getTopic(topicId)
  const userSide = oppositeSide(debaterSide)

  return {
    TOPIC_LABEL: topic.label,
    TOPIC_QUESTION: topic.question,
    DEBATER_SIDE: sideLabel(debaterSide, topic),
    DEBATER_POSITION: topic.positions[debaterSide],
    USER_SIDE: sideLabel(userSide, topic),
    USER_POSITION: topic.positions[userSide],
    FACT_BANK: formatFactBankForPrompt(topicId),
    TOPIC_FACT_BANK: getTopicFactBankJson(topicId),
    TIME_LIMIT_MINUTES: String(debateTimeLimitMinutes()),
  }
}

/** Live voice / text opponent (Huey) — no user diagnostic in the prompt. */
export function renderOpponentPrompt(
  raw: string,
  topicId: TopicId,
  debaterSide: Side,
  hueyDailyContext: string = EMPTY_HUEY_CONTEXT,
): string {
  const topic = getTopic(topicId)
  const context = hueyDailyContext.trim() || EMPTY_HUEY_CONTEXT
  return fillPlaceholders(stripPromptPreamble(raw), {
    TOPIC_LABEL: topic.label,
    TOPIC_QUESTION: topic.question,
    YOUR_SIDE: sideLabel(debaterSide, topic),
    YOUR_POSITION: topic.positions[debaterSide],
    TOPIC_FACT_BANK: getTopicFactBankJson(topicId),
    TIME_LIMIT_MINUTES: String(debateTimeLimitMinutes()),
    HUEY_DAILY_CONTEXT: context.slice(0, 4000),
  })
}

/** Session judge system instruction (payloads arrive in the user message). */
export function renderJudgeSystemPrompt(raw: string): string {
  return stripPromptPreamble(raw)
}

export function renderPrompt(
  raw: string,
  topicId: TopicId,
  debaterSide: Side,
  extra: Record<string, string> = {},
): string {
  return fillPlaceholders(stripPromptPreamble(raw), {
    ...debateContext(topicId, debaterSide),
    ...extra,
  })
}
