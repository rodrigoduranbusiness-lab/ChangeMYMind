import { describe, expect, it } from 'vitest'

import {
  applyStreakUpdate,
  nextStreak,
  shouldDecayStreak,
  shiftDateKey,
  yesterdayKey,
} from '../shared/streak'

describe('shiftDateKey / yesterdayKey', () => {
  it('shifts across month boundaries', () => {
    expect(shiftDateKey('2026-10-01', -1)).toBe('2026-09-30')
    expect(yesterdayKey('2026-01-01')).toBe('2025-12-31')
  })
})

describe('nextStreak', () => {
  it('does not double-count the same day', () => {
    expect(nextStreak(3, '2026-09-26', '2026-09-26')).toEqual({
      streak: 3,
      winsDelta: 0,
      lastWinDateKey: '2026-09-26',
      alreadyCounted: true,
    })
  })

  it('extends streak when last win was yesterday', () => {
    expect(nextStreak(4, '2026-09-25', '2026-09-26')).toEqual({
      streak: 5,
      winsDelta: 1,
      lastWinDateKey: '2026-09-26',
      alreadyCounted: false,
    })
  })

  it('resets streak to 1 after a gap', () => {
    expect(nextStreak(9, '2026-09-20', '2026-09-26')).toEqual({
      streak: 1,
      winsDelta: 1,
      lastWinDateKey: '2026-09-26',
      alreadyCounted: false,
    })
  })

  it('starts a streak on first win', () => {
    expect(nextStreak(0, null, '2026-09-26')).toEqual({
      streak: 1,
      winsDelta: 1,
      lastWinDateKey: '2026-09-26',
      alreadyCounted: false,
    })
  })
})

describe('shouldDecayStreak', () => {
  it('decays when last win is before yesterday', () => {
    expect(shouldDecayStreak('2026-09-20', '2026-09-26')).toBe(true)
    expect(shouldDecayStreak(null, '2026-09-26')).toBe(true)
  })

  it('keeps streak when last win was yesterday or today', () => {
    expect(shouldDecayStreak('2026-09-25', '2026-09-26')).toBe(false)
    expect(shouldDecayStreak('2026-09-26', '2026-09-26')).toBe(false)
  })
})

describe('applyStreakUpdate', () => {
  it('decays then awards a fresh win after a gap', () => {
    expect(
      applyStreakUpdate(
        { wins: 10, streak: 7, longestStreak: 7, lastWinDateKey: '2026-09-20' },
        { won: true, todayKey: '2026-09-26' },
      ),
    ).toEqual({
      wins: 11,
      streak: 1,
      lastWinDateKey: '2026-09-26',
      longestStreak: 7,
    })
  })

  it('only decays on non-win when stale', () => {
    expect(
      applyStreakUpdate(
        { wins: 10, streak: 7, longestStreak: 7, lastWinDateKey: '2026-09-20' },
        { won: false, todayKey: '2026-09-26' },
      ),
    ).toEqual({
      wins: 10,
      streak: 0,
      lastWinDateKey: '2026-09-20',
      longestStreak: 7,
    })
  })

  it('continues a live streak on a second-day win', () => {
    expect(
      applyStreakUpdate(
        { wins: 2, streak: 2, longestStreak: 2, lastWinDateKey: '2026-09-25' },
        { won: true, todayKey: '2026-09-26' },
      ),
    ).toEqual({
      wins: 3,
      streak: 3,
      lastWinDateKey: '2026-09-26',
      longestStreak: 3,
    })
  })

  it('raises longestStreak when the current streak exceeds it', () => {
    expect(
      applyStreakUpdate(
        { wins: 4, streak: 4, longestStreak: 4, lastWinDateKey: '2026-09-25' },
        { won: true, todayKey: '2026-09-26' },
      ),
    ).toEqual({
      wins: 5,
      streak: 5,
      lastWinDateKey: '2026-09-26',
      longestStreak: 5,
    })
  })

  it('defaults longestStreak from streak when missing', () => {
    expect(
      applyStreakUpdate(
        { wins: 3, streak: 3, lastWinDateKey: '2026-09-25' },
        { won: true, todayKey: '2026-09-26' },
      ),
    ).toEqual({
      wins: 4,
      streak: 4,
      lastWinDateKey: '2026-09-26',
      longestStreak: 4,
    })
  })
})
