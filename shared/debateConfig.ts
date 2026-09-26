import { DEBATE_DURATION_MS } from './scoring'

/** Debates end when the clock runs out — no fixed exchange count. */
export function debateTimeLimitMinutes(): number {
  return Math.round(DEBATE_DURATION_MS / 60_000)
}
