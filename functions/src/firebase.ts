import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp()
}

export const db = getFirestore()
export const auth = getAuth()

export function userRef(uid: string) {
  return db.collection('users').doc(uid)
}

export function sessionRef(uid: string, sessionId: string) {
  return userRef(uid).collection('sessions').doc(sessionId)
}

export function debateRoundRef(uid: string, sessionId: string) {
  return userRef(uid).collection('debateRounds').doc(sessionId)
}
