import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { logger } from 'firebase-functions'

import { JUDGE_MODEL } from './config'
import { PROMPTS } from './generated/prompts'
import { renderPrompt } from './shared/prompts'
import type { JudgeScores, Side, TopicId, TranscriptEntry } from './shared/types'

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    evidence_reasoning: { type: 'integer', minimum: 0, maximum: 10 },
    civility_tone: { type: 'integer', minimum: 0, maximum: 10 },
    acknowledges_tradeoffs: { type: 'integer', minimum: 0, maximum: 10 },
    addresses_ai_points: { type: 'integer', minimum: 0, maximum: 10 },
    persuasion: { type: 'integer', minimum: 0, maximum: 100 },
    gaming_detected: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: [
    'evidence_reasoning',
    'civility_tone',
    'acknowledges_tradeoffs',
    'addresses_ai_points',
    'persuasion',
    'gaming_detected',
    'rationale',
  ],
  additionalProperties: false,
}

const TAKEAWAYS_SCHEMA = {
  type: 'object',
  properties: {
    takeaways: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: { type: 'string' },
    },
  },
  required: ['takeaways'],
  additionalProperties: false,
}

let client: GoogleGenAI | undefined

function getClient(apiKey: string): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

/**
 * Renders the transcript for the judge.
 *
 * The user is labeled plainly and the debater is labeled by role rather than
 * by which side it argues, so the judge's attention is not drawn to the
 * politics of either position.
 */
export function formatTranscript(transcript: TranscriptEntry[]): string {
  if (!transcript.length) {
    return '(no speech yet)'
  }
  return transcript
    .map((entry) => `${entry.speaker === 'user' ? 'USER' : 'AI DEBATER'}: ${entry.text.trim()}`)
    .join('\n')
}

export interface JudgeParams {
  apiKey: string
  topic: TopicId
  debaterSide: Side
  transcript: TranscriptEntry[]
}

export async function runJudge(params: JudgeParams): Promise<JudgeScores> {
  const systemInstruction = renderPrompt(PROMPTS.judge, params.topic, params.debaterSide)

  const raw = await generateJson({
    apiKey: params.apiKey,
    systemInstruction,
    schema: JUDGE_SCHEMA,
    contents: `Transcript so far:\n\n${formatTranscript(params.transcript)}\n\nScore the user.`,
  })

  return normalizeJudgeScores(raw)
}

export interface TakeawaysParams {
  apiKey: string
  topic: TopicId
  debaterSide: Side
  transcript: TranscriptEntry[]
  outcome: string
}

export async function runTakeaways(params: TakeawaysParams): Promise<string[]> {
  const systemInstruction = renderPrompt(PROMPTS.takeaways, params.topic, params.debaterSide, {
    OUTCOME: params.outcome,
  })

  try {
    const raw = await generateJson({
      apiKey: params.apiKey,
      systemInstruction,
      schema: TAKEAWAYS_SCHEMA,
      contents: `Transcript:\n\n${formatTranscript(params.transcript)}\n\nWrite the takeaways.`,
    })

    const takeaways = (raw as { takeaways?: unknown }).takeaways
    if (Array.isArray(takeaways)) {
      const cleaned = takeaways
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim())
        .slice(0, 3)
      if (cleaned.length) {
        return cleaned
      }
    }
    throw new Error('takeaways missing from response')
  } catch (error) {
    // Feedback is nice to have; never fail the results screen over it.
    logger.error('Takeaway generation failed', error)
    return [
      'We were not able to generate personalized feedback for this debate.',
      'Your scores below still reflect how the conversation went.',
    ]
  }
}

interface GenerateJsonParams {
  apiKey: string
  systemInstruction: string
  schema: unknown
  contents: string
}

/**
 * One structured-output call with a single retry. The retry exists because a
 * transient 5xx during a live debate would otherwise silently drop a turn.
 */
async function generateJson(params: GenerateJsonParams): Promise<unknown> {
  const ai = getClient(params.apiKey)
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: JUDGE_MODEL,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: params.schema,
          // Deterministic scoring matters more than variety here.
          temperature: 0,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      })

      const text = response.text
      if (!text) {
        throw new Error('Model returned an empty response')
      }
      return JSON.parse(text) as unknown
    } catch (error) {
      lastError = error
      logger.warn(`Gemini JSON call failed (attempt ${attempt + 1})`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Gemini JSON call failed')
}

/**
 * The schema constrains the model, but the scores drive win/lose, so they get
 * clamped into range rather than trusted outright.
 */
export function normalizeJudgeScores(raw: unknown): JudgeScores {
  const data = (raw ?? {}) as Record<string, unknown>

  return {
    evidence_reasoning: clampInt(data.evidence_reasoning, 0, 10),
    civility_tone: clampInt(data.civility_tone, 0, 10),
    acknowledges_tradeoffs: clampInt(data.acknowledges_tradeoffs, 0, 10),
    addresses_ai_points: clampInt(data.addresses_ai_points, 0, 10),
    persuasion: clampInt(data.persuasion, 0, 100),
    gaming_detected: data.gaming_detected === true,
    rationale: typeof data.rationale === 'string' ? data.rationale.slice(0, 500) : '',
  }
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(n)))
}
