import { GoogleAuth } from 'google-auth-library'
import { HttpsError } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { GCP_PROJECT, VERTEX_LOCATION } from '../config'
import type { LiveAccessResponse } from './types'

const LIVE_MODEL = process.env.LIVE_MODEL ?? 'gemini-live-2.5-flash-native-audio'

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})

export async function mintVertexLiveAccess(
  request: CallableRequest,
): Promise<LiveAccessResponse> {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const client = await auth.getClient()
  const tokenResponse = await client.getAccessToken()
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token
  if (!accessToken) {
    throw new HttpsError('internal', 'Could not mint a Live access token.')
  }

  const expiresAt = Date.now() + 55 * 60 * 1000
  const location = VERTEX_LOCATION
  const wsUrl =
    `wss://${location}-aiplatform.googleapis.com/ws/` +
    `google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`

  const model =
    `projects/${GCP_PROJECT}/locations/${location}/publishers/google/models/${LIVE_MODEL}`

  return {
    provider: 'vertex',
    accessToken,
    expiresAt,
    wsUrl,
    model,
    location,
  }
}
