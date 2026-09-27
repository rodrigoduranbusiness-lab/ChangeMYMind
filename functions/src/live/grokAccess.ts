import { HttpsError } from 'firebase-functions/v2/https'
import type { CallableRequest } from 'firebase-functions/v2/https'

import { GROK_API_BASE, GROK_VOICE_MODEL, requireXaiApiKey } from '../config'
import type { LiveAccessResponse } from './types'

const EPHEMERAL_SECONDS = Number(process.env.GROK_EPHEMERAL_SECONDS ?? 3600)

export async function mintGrokLiveAccess(request: CallableRequest): Promise<LiveAccessResponse> {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.')
  }

  const apiKey = requireXaiApiKey()
  const response = await fetch(`${GROK_API_BASE}/realtime/client_secrets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expires_after: { seconds: Math.min(Math.max(EPHEMERAL_SECONDS, 60), 3600) },
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new HttpsError(
      'internal',
      `Could not mint Grok ephemeral token (${response.status}): ${body.slice(0, 200)}`,
    )
  }

  const payload = (await response.json()) as Record<string, unknown>
  const secret =
    (typeof payload.value === 'string' && payload.value) ||
    (typeof payload.client_secret === 'object' &&
      payload.client_secret !== null &&
      typeof (payload.client_secret as { value?: string }).value === 'string' &&
      (payload.client_secret as { value: string }).value) ||
    ''

  if (!secret) {
    throw new HttpsError('internal', 'Grok client_secrets response missing token value.')
  }

  const expiresRaw =
    typeof payload.expires_at === 'number'
      ? payload.expires_at
      : typeof payload.expires_at === 'string'
        ? Number(payload.expires_at)
        : NaN
  const expiresAt = Number.isFinite(expiresRaw)
    ? expiresRaw > 1e12
      ? expiresRaw
      : expiresRaw * 1000
    : Date.now() + EPHEMERAL_SECONDS * 1000

  const wsUrl = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(GROK_VOICE_MODEL)}`

  return {
    provider: 'grok',
    accessToken: secret,
    expiresAt,
    wsUrl,
    model: GROK_VOICE_MODEL,
    location: 'us-east-1',
  }
}
