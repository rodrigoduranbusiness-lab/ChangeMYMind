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
 * The placeholder values shared by all three prompts. Both sides are always
 * described with the same sentence structure, which is what keeps the debater
 * and judge even-handed.
 */
export function debateContext(topicId: TopicId, debaterSide: Side): Record<string, string> {
  const topic = getTopic(topicId)
  const userSide = oppositeSide(debaterSide)

  return {
    TOPIC_LABEL: topic.label,
    TOPIC_QUESTION: topic.question,
    DEBATER_SIDE: sideLabel(debaterSide),
    DEBATER_POSITION: topic.positions[debaterSide],
    USER_SIDE: sideLabel(userSide),
    USER_POSITION: topic.positions[userSide],
  }
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
