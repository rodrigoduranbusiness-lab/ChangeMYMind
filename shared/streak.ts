import { getCalendarDateKey } from './dailyTopics'

export { getCalendarDateKey }

/** Shift a YYYY-MM-DD calendar key by N days (civil date arithmetic). */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [ys, ms, ds] = dateKey.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return dateKey
  }
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  const year = dt.getUTCFullYear()
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(dt.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function yesterdayKey(todayKey: string): string {
  return shiftDateKey(todayKey, -1)
}

export interface NextStreakResult {
  streak: number
  /** 1 if this is the first win of the day, else 0. */
  winsDelta: number
  lastWinDateKey: string
  alreadyCounted: boolean
}

/**
 * Streak / day-win update when the user just won a debate.
 * At most one win and one streak step per calendar day (America/New_York).
 */
export function nextStreak(
  prevStreak: number,
  lastWinDateKey: string | null | undefined,
  todayKey: string,
): NextStreakResult {
  if (lastWinDateKey === todayKey) {
    return {
      streak: Math.max(0, prevStreak),
      winsDelta: 0,
      lastWinDateKey: todayKey,
      alreadyCounted: true,
    }
  }
  if (lastWinDateKey === yesterdayKey(todayKey)) {
    return {
      streak: Math.max(0, prevStreak) + 1,
      winsDelta: 1,
      lastWinDateKey: todayKey,
      alreadyCounted: false,
    }
  }
  return {
    streak: 1,
    winsDelta: 1,
    lastWinDateKey: todayKey,
    alreadyCounted: false,
  }
}

/**
 * True when the streak should clear: no last win, or last win before yesterday.
 * Winning yesterday or today keeps the streak alive.
 */
export function shouldDecayStreak(
  lastWinDateKey: string | null | undefined,
  todayKey: string,
): boolean {
  if (!lastWinDateKey) return true
  if (lastWinDateKey === todayKey) return false
  if (lastWinDateKey === yesterdayKey(todayKey)) return false
  return true
}

export interface UserStreakFields {
  wins: number
  streak: number
  lastWinDateKey: string | null
  /** Max consecutive win days ever. Never decreases. */
  longestStreak: number
}

/** Apply optional decay, then optional win, returning the next profile fields. */
export function applyStreakUpdate(
  current: Partial<UserStreakFields>,
  opts: { won: boolean; todayKey?: string },
): UserStreakFields {
  const todayKey = opts.todayKey ?? getCalendarDateKey()
  let wins = typeof current.wins === 'number' && Number.isFinite(current.wins) ? current.wins : 0
  let streak =
    typeof current.streak === 'number' && Number.isFinite(current.streak) ? current.streak : 0
  let lastWinDateKey =
    typeof current.lastWinDateKey === 'string' ? current.lastWinDateKey : null
  let longestStreak =
    typeof current.longestStreak === 'number' && Number.isFinite(current.longestStreak)
      ? Math.max(0, current.longestStreak)
      : 0

  if (shouldDecayStreak(lastWinDateKey, todayKey)) {
    streak = 0
  }

  if (opts.won) {
    const next = nextStreak(streak, lastWinDateKey, todayKey)
    if (!next.alreadyCounted) {
      streak = next.streak
      wins += next.winsDelta
      lastWinDateKey = next.lastWinDateKey
    }
  }

  longestStreak = Math.max(longestStreak, streak)

  return { wins, streak, lastWinDateKey, longestStreak }
}
