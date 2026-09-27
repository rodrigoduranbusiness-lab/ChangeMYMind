import type { AiProvider } from '../shared/aiProvider'

export interface LiveAccessResponse {
  provider: AiProvider
  accessToken: string
  expiresAt: number
  wsUrl: string
  model: string
  /** Vertex region or Grok cluster hint for logging. */
  location: string
  /** Today's Huey winner context for the opponent prompt (optional). */
  hueyDailyContext?: string
}
