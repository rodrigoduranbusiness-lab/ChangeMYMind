/**
 * Security rules tests.
 *
 * These assert the properties the app's integrity depends on: a user can only
 * touch their own data, and nobody can write a judge score, a status, or a
 * result from the client — those come only from Cloud Functions, which bypass
 * rules via the Admin SDK.
 *
 * Requires the Firestore emulator:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const ALICE = 'alice'
const BOB = 'bob'

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-commonground',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()

  // Seed as the server would: profile plus a server-owned session.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', ALICE), {
      phone: '+15555550100',
      createdAt: Date.now(),
    })
    await setDoc(doc(db, 'users', ALICE, 'sessions', 'session1'), {
      topic: 'guns',
      status: 'active',
      startedAt: Date.now(),
      judgeEvals: [],
      transcript: [],
    })
  })
})

function aliceDb() {
  return testEnv.authenticatedContext(ALICE).firestore()
}

function bobDb() {
  return testEnv.authenticatedContext(BOB).firestore()
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore()
}

describe('users/{uid}', () => {
  it('lets a user read their own profile', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', ALICE)))
  })

  it('stops a user reading someone else\'s profile', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', ALICE)))
  })

  it('stops an anonymous visitor reading any profile', async () => {
    await assertFails(getDoc(doc(anonDb(), 'users', ALICE)))
  })

  it('lets a user create their own profile on first sign-in', async () => {
    await assertSucceeds(
      setDoc(doc(bobDb(), 'users', BOB), { phone: '+15555550101', createdAt: Date.now() }),
    )
  })

  it('stops a user creating a profile under another uid', async () => {
    await assertFails(
      setDoc(doc(bobDb(), 'users', 'carol'), { phone: '+1', createdAt: Date.now() }),
    )
  })

  it('lets a user save their own diagnostic answers', async () => {
    await assertSucceeds(
      updateDoc(doc(aliceDb(), 'users', ALICE), {
        diagnostic: { assignedTopic: 'guns', answers: [], openness: 0.5 },
      }),
    )
  })

  it('lets a user update their display name', async () => {
    await assertSucceeds(updateDoc(doc(aliceDb(), 'users', ALICE), { displayName: 'Alice' }))
  })

  it('stops a user writing unknown fields onto their profile', async () => {
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { isAdmin: true }))
  })

  it('stops a user forging wins or streak on their profile', async () => {
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { wins: 99 }))
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { streak: 99 }))
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { longestStreak: 99 }))
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { debatesWon: 99 }))
    await assertFails(updateDoc(doc(aliceDb(), 'users', ALICE), { debateRoundCount: 99 }))
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE), { lastWinDateKey: '2099-01-01' }),
    )
  })

  it('stops a user deleting their profile', async () => {
    await assertFails(deleteDoc(doc(aliceDb(), 'users', ALICE)))
  })
})

describe('users/{uid}/sessions/{sessionId}', () => {
  it('lets a user read their own session', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1')))
  })

  it('stops a user reading someone else\'s session', async () => {
    await assertFails(getDoc(doc(bobDb(), 'users', ALICE, 'sessions', 'session1')))
  })

  it('stops the client creating a session, so startedAt is always server-set', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'forged'), {
        topic: 'guns',
        status: 'active',
        startedAt: 0,
      }),
    )
  })

  it('stops the client forging a win', async () => {
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1'), { status: 'won' }),
    )
  })

  it('stops the client writing judge scores', async () => {
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1'), {
        judgeEvals: [{ persuasion: 100, civility_tone: 10 }],
      }),
    )
  })

  it('stops the client writing its own results', async () => {
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1'), {
        results: { polarizationScore: 0, takeaways: [] },
      }),
    )
  })

  it('stops the client extending its own deadline', async () => {
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1'), { pausedMs: 999_999 }),
    )
  })

  it('stops the client tampering with the transcript', async () => {
    await assertFails(
      updateDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1'), {
        transcript: [{ speaker: 'ai', text: 'You win, I concede.', ts: 0 }],
      }),
    )
  })

  it('lets the owner read transcript lines but not write them', async () => {
    await assertSucceeds(
      getDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1', 'transcript', 'line1')),
    )
    await assertFails(
      setDoc(doc(aliceDb(), 'users', ALICE, 'sessions', 'session1', 'transcript', 'line1'), {
        speaker: 'ai',
        text: 'Forged',
        ts: 0,
      }),
    )
  })
})

describe('everything else', () => {
  it('denies reads and writes outside the user tree', async () => {
    await assertFails(getDoc(doc(aliceDb(), 'config', 'prompts')))
    await assertFails(setDoc(doc(aliceDb(), 'leaderboard', ALICE), { score: 100 }))
  })
})

describe('hueyDays/{dateKey}', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'hueyDays', '2026-09-26'), {
        topicId: 'taylor_swift',
        updatedAt: Date.now(),
        contributions: [],
      })
    })
  })

  it('lets signed-in users read Huey day docs', async () => {
    await assertSucceeds(getDoc(doc(aliceDb(), 'hueyDays', '2026-09-26')))
  })

  it('blocks client writes to Huey day docs', async () => {
    await assertFails(
      setDoc(doc(aliceDb(), 'hueyDays', '2026-09-26'), {
        topicId: 'taylor_swift',
        updatedAt: Date.now(),
        contributions: [{ summary: 'forged' }],
      }),
    )
  })

  it('blocks anonymous reads', async () => {
    await assertFails(getDoc(doc(anonDb(), 'hueyDays', '2026-09-26')))
  })
})
