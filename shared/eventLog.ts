import { CONDUCT_EVENTS_NEEDS_WORK, INTERRUPTIONS_TO_LOSE } from './conduct'
import type { EventLogEntry, SessionOutcomeReason } from './types'

export function mapConductKindToEventType(
  kind: 'interruption' | 'long_turn' | 'yelling' | 'mild_insult',
): EventLogEntry['type'] {
  if (kind === 'mild_insult') return 'insult'
  if (kind === 'long_turn') return 'long_turn'
  return kind
}

export function appendEventLog(
  log: EventLogEntry[] | undefined,
  entry: Omit<EventLogEntry, 'ts'> & { ts?: number },
): EventLogEntry[] {
  const next: EventLogEntry = {
    ts: entry.ts ?? Date.now(),
    turn: entry.turn,
    type: entry.type,
    source: entry.source,
    ...(entry.detail ? { detail: entry.detail } : {}),
  }
  return [...(log ?? []), next]
}

/** Hard stops detected before or during the debate (not from the judge model). */
export function hardStopFromEventLog(log: EventLogEntry[] | undefined): {
  stop: boolean
  reason: SessionOutcomeReason | null
} {
  if (!log?.length) {
    return { stop: false, reason: null }
  }
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!
    if (e.type === 'hate_speech') {
      return { stop: true, reason: 'hate_speech' }
    }
    if (e.type === 'toxicity') {
      return { stop: true, reason: 'incivility' }
    }
    if (e.type === 'yelling') {
      return { stop: true, reason: 'yelling' }
    }
  }
  return { stop: false, reason: null }
}

export function interruptionCount(log: EventLogEntry[] | undefined): number {
  if (!log?.length) return 0
  return log.filter((e) => e.type === 'interruption' || e.type === 'long_turn').length
}

export function interruptionLoss(log: EventLogEntry[] | undefined): boolean {
  return interruptionCount(log) >= INTERRUPTIONS_TO_LOSE
}

export function penaltyEventCount(log: EventLogEntry[] | undefined): number {
  if (!log?.length) return 0
  return log.filter((e) =>
    ['interruption', 'long_turn', 'yelling', 'insult', 'dismissiveness'].includes(e.type),
  ).length
}

export function conductCapReached(log: EventLogEntry[] | undefined): boolean {
  return penaltyEventCount(log) >= CONDUCT_EVENTS_NEEDS_WORK
}
