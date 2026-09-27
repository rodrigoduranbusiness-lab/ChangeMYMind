import { onCall } from 'firebase-functions/v2/https'

import { AI_PROVIDER, REGION } from '../config'
import { mintGrokLiveAccess } from './grokAccess'
import { mintVertexLiveAccess } from './vertexAccess'
import type { LiveAccessResponse } from './types'

/**
 * Mints short-lived credentials for the browser voice WebSocket (Vertex or Grok).
 */
export const mintLiveAccess = onCall<unknown, Promise<LiveAccessResponse>>(
  { region: REGION },
  async (request) => {
    if (AI_PROVIDER === 'grok') {
      return mintGrokLiveAccess(request)
    }
    return mintVertexLiveAccess(request)
  },
)

export type { LiveAccessResponse } from './types'
