import { getTopic } from './topics'
import type { Side, Stance, TopicId } from './types'

export const DAILY_TZ = 'America/New_York'

export interface DailyTopicFact {
  id: string
  claim: string
  source: string
}

export interface DailyTopic {
  /** Calendar date YYYY-MM-DD in America/New_York. */
  dateKey: string
  topicId: TopicId
  label: string
  question: string
  forLabel: string
  againstLabel: string
  /** Short facts shown on /today (mirrors fact-bank highlights). */
  facts: DailyTopicFact[]
}

/**
 * Hardcoded calendar. Extend as needed; rolling default picks latest ≤ today.
 * 2026-09-26 is also the fallback when the table is empty or "today" is missing.
 */
export const DAILY_TOPICS: DailyTopic[] = [
  {
    dateKey: '2026-09-26',
    topicId: 'taylor_swift',
    label: 'Taylor Swift',
    question: 'Is Taylor Swift a net positive or net negative contribution to music?',
    forLabel: 'Positive contribution',
    againstLabel: 'Negative contribution',
    facts: [
      {
        id: 'ts1',
        claim:
          'Taylor Swift has won 14 Grammy Awards, including four Album of the Year wins — the most of any artist.',
        source: 'Recording Academy / Grammy records',
      },
      {
        id: 'ts2',
        claim:
          'The Eras Tour (2023–2024) became the highest-grossing concert tour on record, with reported revenue above $2 billion.',
        source: 'Pollstar / Billboard tour reports',
      },
      {
        id: 'ts3',
        claim:
          'Her catalog spans country, pop, indie-folk, and synth-pop, with multiple albums that topped charts years after release via re-recordings.',
        source: 'Billboard chart history',
      },
      {
        id: 'ts4',
        claim:
          'Critics and some musicians argue stadium-pop formula and media saturation can crowd out emerging artists on playlists and award stages.',
        source: 'Music press commentary (composite)',
      },
      {
        id: 'ts5',
        claim:
          'Streaming and sales data show she repeatedly drove industry-wide consumption spikes on release weeks.',
        source: 'Luminate / Billboard consumption reports',
      },
      {
        id: 'ts6',
        claim:
          'Songwriting credits list her as a primary writer on the large majority of her released songs across eras.',
        source: 'ASCAP / album liner credits',
      },
    ],
  },
  {
    dateKey: '2026-09-27',
    topicId: 'taylor_swift',
    label: 'Taylor Swift',
    question: "Is Taylor Swift's impact on the music industry positive or negative?",
    forLabel: 'Positive',
    againstLabel: 'Negative',
    facts: [
      {
        id: 'ts1',
        claim:
          'Taylor Swift has won 14 Grammy Awards, including four Album of the Year wins — the most of any artist.',
        source: 'Recording Academy / Grammy records',
      },
      {
        id: 'ts2',
        claim:
          'The Eras Tour (2023–2024) became the highest-grossing concert tour on record, with reported revenue above $2 billion.',
        source: 'Pollstar / Billboard tour reports',
      },
      {
        id: 'ts3',
        claim:
          'Her catalog spans country, pop, indie-folk, and synth-pop, with multiple albums that topped charts years after release via re-recordings.',
        source: 'Billboard chart history',
      },
      {
        id: 'ts4',
        claim:
          'Critics and some musicians argue stadium-pop formula and media saturation can crowd out emerging artists on playlists and award stages.',
        source: 'Music press commentary (composite)',
      },
      {
        id: 'ts5',
        claim:
          'Streaming and sales data show she repeatedly drove industry-wide consumption spikes on release weeks.',
        source: 'Luminate / Billboard consumption reports',
      },
      {
        id: 'ts6',
        claim:
          'Songwriting credits list her as a primary writer on the large majority of her released songs across eras.',
        source: 'ASCAP / album liner credits',
      },
    ],
  },
]

/** YYYY-MM-DD in America/New_York. */
export function getCalendarDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!year || !month || !day) {
    return DAILY_TOPICS[0]?.dateKey ?? '2026-09-26'
  }
  return `${year}-${month}-${day}`
}

/**
 * Today's topic. If the date is missing from the table, use the latest on or
 * before today; otherwise the first topic (Taylor Swift fallback).
 */
export function getDailyTopic(now: Date = new Date()): DailyTopic {
  const key = getCalendarDateKey(now)
  const exact = DAILY_TOPICS.find((t) => t.dateKey === key)
  if (exact) return exact

  const onOrBefore = DAILY_TOPICS.filter((t) => t.dateKey <= key).sort((a, b) =>
    a.dateKey < b.dateKey ? 1 : -1,
  )
  if (onOrBefore.length) return onOrBefore[0]!

  return DAILY_TOPICS[0]!
}

/** for → left, against → right (arbitrary Side mapping; UI uses for/against labels). */
export function stanceToSide(stance: Stance): Side {
  return stance === 'for' ? 'left' : 'right'
}

export function sideToStance(side: Side): Stance {
  return side === 'left' ? 'for' : 'against'
}

export function stanceLabel(topic: DailyTopic, stance: Stance): string {
  return stance === 'for' ? topic.forLabel : topic.againstLabel
}

/** TopicConfig label for the user's chosen stance (from shared topics). */
export function stancePositionText(topicId: TopicId, stance: Stance): string {
  const topic = getTopic(topicId)
  return topic.positions[stanceToSide(stance)]
}
