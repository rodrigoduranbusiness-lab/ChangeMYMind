import { getDailyTopic, stanceToSide, type DailyTopic } from '@shared/dailyTopics'
import type { DebateModality, Side, Stance, TopicId } from '@shared/types'

const KEY = 'cmm-daily-debate'

export interface DailyDebateChoice {
  dateKey: string
  topicId: TopicId
  stance: Stance
  userSide: Side
  modality?: DebateModality
}

function readRaw(): Partial<DailyDebateChoice> | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<DailyDebateChoice>
  } catch {
    return null
  }
}

function write(partial: Partial<DailyDebateChoice>) {
  const prev = readRaw() ?? {}
  const next = { ...prev, ...partial }
  sessionStorage.setItem(KEY, JSON.stringify(next))
}

export function getTodayTopic(): DailyTopic {
  return getDailyTopic()
}

export function saveStance(stance: Stance) {
  const topic = getDailyTopic()
  write({
    dateKey: topic.dateKey,
    topicId: topic.topicId,
    stance,
    userSide: stanceToSide(stance),
  })
}

export function saveModality(modality: DebateModality) {
  write({ modality })
}

export function getDebateChoice(): DailyDebateChoice | null {
  const raw = readRaw()
  const today = getDailyTopic()
  if (!raw?.topicId || !raw.stance || !raw.userSide) return null
  if (raw.dateKey && raw.dateKey !== today.dateKey) return null
  if (raw.topicId !== today.topicId) return null
  return {
    dateKey: today.dateKey,
    topicId: raw.topicId,
    stance: raw.stance,
    userSide: raw.userSide,
    modality: raw.modality,
  }
}
