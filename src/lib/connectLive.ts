import type { LiveAccessCredentials } from './api'
import { GrokLiveSession } from './grokLive'
import { VertexLiveSession } from './vertexLive'
import { GROK_VOICE, LIVE_VOICE } from '../firebase'

export type LiveVoiceSession = VertexLiveSession | GrokLiveSession

export async function connectLiveVoiceSession(
  access: LiveAccessCredentials,
  systemInstruction: string,
): Promise<LiveVoiceSession> {
  if (access.provider === 'grok') {
    return GrokLiveSession.connect({
      accessToken: access.accessToken,
      wsUrl: access.wsUrl,
      systemInstruction,
      voiceName: GROK_VOICE,
    })
  }

  return VertexLiveSession.connect({
    accessToken: access.accessToken,
    wsUrl: access.wsUrl,
    model: access.model,
    systemInstruction,
    voiceName: LIVE_VOICE,
  })
}
