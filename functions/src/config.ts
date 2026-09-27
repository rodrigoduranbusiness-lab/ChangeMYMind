import { parseAiProvider, type AiProvider } from './shared/aiProvider'

/**
 * `vertex` (default) — Gemini on Vertex for judge, takeaways, and Live voice.
 * `grok` — xAI Grok for judge/takeaways and Grok Voice realtime (see docs/GROK.md).
 */
export const AI_PROVIDER: AiProvider = parseAiProvider(process.env.AI_PROVIDER)

/**
 * Text-only model for the judge and takeaways (Vertex path).
 * Structured output and low thinking levels keep per-turn latency acceptable.
 */
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gemini-2.5-flash'

/** Grok text model for judge + takeaways when AI_PROVIDER=grok. */
export const GROK_JUDGE_MODEL = process.env.GROK_JUDGE_MODEL ?? 'grok-4-1-fast-non-reasoning'

export const GROK_API_BASE = (process.env.GROK_API_BASE ?? 'https://api.x.ai/v1').replace(/\/$/, '')

/** Grok Voice realtime model query param. */
export const GROK_VOICE_MODEL = process.env.GROK_VOICE_MODEL ?? 'grok-voice-latest'

export const GROK_VOICE = process.env.GROK_VOICE ?? 'eve'

export const REGION = process.env.FUNCTIONS_REGION ?? 'us-central1'

/** Vertex / Agent Platform location for judge + takeaways. */
export const VERTEX_LOCATION = process.env.VERTEX_LOCATION ?? 'us-central1'

export const GCP_PROJECT =
  process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'talkitthrough-12076'

export function requireXaiApiKey(): string {
  const key = (process.env.XAI_API_KEY ?? process.env.X_AI_API_KEY)?.trim()
  if (!key) {
    throw new Error(
      'xAI API key is not configured (set Functions secret X_AI_API_KEY or XAI_API_KEY when AI_PROVIDER=grok).',
    )
  }
  return key
}
