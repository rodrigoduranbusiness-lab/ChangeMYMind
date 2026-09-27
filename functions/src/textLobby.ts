import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { REGION } from './config'
import { db } from './firebase'
import { detectInstantLossSpeech } from './shared/conduct'
import { getCalendarDateKey } from './shared/dailyTopics'
import { DEBATE_DURATION_MS } from './shared/scoring'
import { TOPIC_IDS } from './shared/topics'
import type {
  JoinTextLobbyRequest,
  JoinTextLobbyResponse,
  LeaveTextLobbyRequest,
  SendTextMessageRequest,
  SendTextMessageResponse,
  Stance,
  TopicId,
} from './shared/types'

const callOptions = { region: REGION }
const LOBBY_STALE_MS = 45_000

function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }
  return uid
}

function lobbyQueueRef(topicId: TopicId) {
  return db.collection('textLobbies').doc(topicId).collection('queue')
}

function roomRef(roomId: string) {
  return db.collection('textRooms').doc(roomId)
}

function oppositeStance(stance: Stance): Stance {
  return stance === 'for' ? 'against' : 'for'
}

function assertTopic(topicId: unknown): TopicId {
  if (typeof topicId !== 'string' || !TOPIC_IDS.includes(topicId as TopicId)) {
    throw new HttpsError('invalid-argument', 'Unknown topicId.')
  }
  return topicId as TopicId
}

function assertStance(stance: unknown): Stance {
  if (stance !== 'for' && stance !== 'against') {
    throw new HttpsError('invalid-argument', 'stance must be for or against.')
  }
  return stance
}

/**
 * Upserts waiting presence. If another waiting user has the opposite stance on
 * the same topic, creates a room and marks both matched.
 */
export const joinTextLobby = onCall<JoinTextLobbyRequest, Promise<JoinTextLobbyResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const topicId = assertTopic(request.data?.topicId)
    const stance = assertStance(request.data?.stance)
    const displayName =
      typeof request.data?.displayName === 'string'
        ? request.data.displayName.trim().slice(0, 40)
        : null

    const now = Date.now()
    const dateKey = getCalendarDateKey(new Date(now))
    const queue = lobbyQueueRef(topicId)
    const myRef = queue.doc(uid)

    const result = await db.runTransaction(async (tx) => {
      const mySnap = await tx.get(myRef)
      if (mySnap.exists && mySnap.get('status') === 'matched' && mySnap.get('roomId')) {
        return {
          status: 'matched' as const,
          roomId: String(mySnap.get('roomId')),
          opponentUid: (mySnap.get('opponentUid') as string | null) ?? null,
        }
      }

      const waitingSnap = await tx.get(queue.where('status', '==', 'waiting').limit(20))
      const partner = waitingSnap.docs.find((doc) => {
        if (doc.id === uid) return false
        const data = doc.data()
        if (data.stance !== oppositeStance(stance)) return false
        const updatedAt = Number(data.updatedAt) || 0
        return now - updatedAt < LOBBY_STALE_MS
      })

      if (partner) {
        const roomId = db.collection('textRooms').doc().id
        const partnerStance = partner.get('stance') as Stance
        const deadline = now + DEBATE_DURATION_MS

        tx.set(roomRef(roomId), {
          topicId,
          dateKey,
          participants: {
            [uid]: stance,
            [partner.id]: partnerStance,
          },
          createdAt: now,
          status: 'active',
          deadline,
        })

        tx.set(myRef, {
          uid,
          stance,
          displayName,
          updatedAt: now,
          status: 'matched',
          roomId,
          opponentUid: partner.id,
        })
        tx.set(
          partner.ref,
          {
            status: 'matched',
            roomId,
            opponentUid: uid,
            updatedAt: now,
          },
          { merge: true },
        )

        return {
          status: 'matched' as const,
          roomId,
          opponentUid: partner.id,
        }
      }

      tx.set(myRef, {
        uid,
        stance,
        displayName,
        updatedAt: now,
        status: 'waiting',
        roomId: null,
        opponentUid: null,
      })

      return {
        status: 'waiting' as const,
        roomId: null,
        opponentUid: null,
      }
    })

    logger.info('joinTextLobby', { uid, topicId, stance, ...result })
    return result
  },
)

/** Heartbeat while waiting — refreshes updatedAt so matching stays fresh. */
export const heartbeatTextLobby = onCall<JoinTextLobbyRequest, Promise<{ ok: true }>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const topicId = assertTopic(request.data?.topicId)
    const stance = assertStance(request.data?.stance)
    const ref = lobbyQueueRef(topicId).doc(uid)
    const snap = await ref.get()
    if (!snap.exists) {
      return { ok: true }
    }
    await ref.set(
      {
        uid,
        stance,
        updatedAt: Date.now(),
        status: snap.get('status') === 'matched' ? 'matched' : 'waiting',
        roomId: snap.get('roomId') ?? null,
        opponentUid: snap.get('opponentUid') ?? null,
        displayName: snap.get('displayName') ?? null,
      },
      { merge: true },
    )
    return { ok: true }
  },
)

export const leaveTextLobby = onCall<LeaveTextLobbyRequest, Promise<{ ok: true }>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const topicId = assertTopic(request.data?.topicId)
    await lobbyQueueRef(topicId).doc(uid).delete().catch(() => {})
    return { ok: true }
  },
)

/**
 * Peer chat send with server-side civility check. Hate/abuse ends the room
 * for the offender (status lost) and writes a system moderator note.
 */
export const sendTextMessage = onCall<SendTextMessageRequest, Promise<SendTextMessageResponse>>(
  callOptions,
  async (request) => {
    const uid = requireUid(request)
    const roomId = request.data?.roomId
    const raw = request.data?.text
    if (typeof roomId !== 'string' || !roomId) {
      throw new HttpsError('invalid-argument', 'roomId is required.')
    }
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new HttpsError('invalid-argument', 'text is required.')
    }
    const text = raw
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
      .trim()
      .slice(0, 2000)

    const wordCount = text.split(/\s+/).filter(Boolean).length
    if (wordCount > 20) {
      throw new HttpsError(
        'invalid-argument',
        `Messages are limited to 20 words (got ${wordCount}).`,
      )
    }

    const ref = roomRef(roomId)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Room not found.')
    }
    const room = snap.data() as {
      status?: string
      participants?: Record<string, Stance>
      deadline?: number
    }
    if (!room.participants?.[uid]) {
      throw new HttpsError('permission-denied', 'You are not in this room.')
    }
    if (room.status !== 'active') {
      return { outcome: 'lost', reason: 'abandoned', messageId: null }
    }
    if (typeof room.deadline === 'number' && Date.now() > room.deadline) {
      await ref.update({ status: 'ended', endReason: 'timeout' })
      return { outcome: 'lost', reason: 'timeout', messageId: null }
    }

    const instant = detectInstantLossSpeech(text)
    if (instant) {
      const msgRef = ref.collection('messages').doc()
      await msgRef.set({
        uid: 'system',
        text: 'Moderator: that message broke the civility rules. This debate ends as a loss for the sender.',
        createdAt: Date.now(),
        kind: 'moderator',
      })
      await ref.update({
        status: 'ended',
        endReason: instant,
        endedBy: uid,
        endedAt: Date.now(),
      })
      return { outcome: 'lost', reason: instant, messageId: msgRef.id }
    }

    const msgRef = ref.collection('messages').doc()
    await msgRef.set({
      uid,
      text,
      createdAt: Date.now(),
      kind: 'user',
    })
    await ref.update({ lastMessageAt: Date.now(), messageCount: FieldValue.increment(1) })

    return { outcome: 'continue', reason: null, messageId: msgRef.id }
  },
)
