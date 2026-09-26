import { GoogleAuth } from 'google-auth-library'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { GCP_PROJECT, REGION, VERTEX_LOCATION } from './config'

/**
 * Short-lived Vertex credentials for the browser Live WebSocket.
 *
 * Firebase AI Logic's Live path cannot attach App Check tokens from a browser
 * WebSocket (no custom headers), so the handshake fails with
 * "App Check token is invalid" → missing setupComplete. Vertex accepts
 * `?access_token=` on the WebSocket URL, which browsers can use.
 *
 * The token is the Cloud Function service account's access token (≈1h). Only
 * signed-in users can mint one; abuse surface is Vertex quota on this project.
 */
export interface LiveAccessResponse {
  accessToken: string
  expiresAt: number
  wsUrl: string
  model: string
  location: string
}

const LIVE_MODEL = process.env.LIVE_MODEL ?? 'gemini-live-2.5-flash-native-audio'

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

export const mintLiveAccess = onCall({ region: REGION }, async (request: CallableRequest) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const client = await auth.getClient()
  const tokenResponse = await client.getAccessToken()
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token
  if (!accessToken) {
    throw new HttpsError('internal', 'Could not mint a Live access token.')
  }

  // google-auth-library does not always expose expiry; assume ~55 minutes.
  const expiresAt = Date.now() + 55 * 60 * 1000

  const location = VERTEX_LOCATION
  const wsUrl =
    `wss://${location}-aiplatform.googleapis.com/ws/` +
    `google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`

  const model =
    `projects/${GCP_PROJECT}/locations/${location}/publishers/google/models/${LIVE_MODEL}`

  const response: LiveAccessResponse = {
    accessToken,
    expiresAt,
    wsUrl,
    model,
    location,
  }
  return response
})
