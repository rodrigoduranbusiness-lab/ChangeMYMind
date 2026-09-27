import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { REGION } from './config'
import { auth, db, userRef } from './firebase'

function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }
  return uid
}

/**
 * Permanently deletes the caller's Auth account and Firestore profile
 * (including session history). Irreversible.
 */
export const deleteAccount = onCall({ region: REGION }, async (request) => {
  const uid = requireUid(request)
  const user = userRef(uid)

  const sessions = await user.collection('sessions').listDocuments()
  // Batches cap at 500 ops; a normal user will be far under that.
  let batch = db.batch()
  let ops = 0

  async function flush() {
    if (ops === 0) return
    await batch.commit()
    batch = db.batch()
    ops = 0
  }

  const roundDocs = await user.collection('debateRounds').listDocuments()
  for (const roundDoc of roundDocs) {
    batch.delete(roundDoc)
    ops += 1
    if (ops >= 450) await flush()
  }

  for (const sessionDoc of sessions) {
    const lines = await sessionDoc.collection('transcript').listDocuments()
    for (const lineDoc of lines) {
      batch.delete(lineDoc)
      ops += 1
      if (ops >= 450) await flush()
    }
    batch.delete(sessionDoc)
    ops += 1
    if (ops >= 450) await flush()
  }

  batch.delete(user)
  ops += 1
  await flush()

  await auth.deleteUser(uid)
  logger.info('Deleted account', { uid })
  return { ok: true as const }
})
