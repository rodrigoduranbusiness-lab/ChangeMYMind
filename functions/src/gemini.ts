import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { logger } from 'firebase-functions'

import { GCP_PROJECT, JUDGE_MODEL, VERTEX_LOCATION } from './config'
import { PROMPTS } from './generated/prompts'
import { getTopicFactBankJson } from './shared/factBank'
import { markUntrustedUserSpeech } from './shared/promptGuard'
import { normalizeJudgeVerdict } from './shared/judgeVerdict'
import { renderJudgeSystemPrompt, renderPrompt } from './shared/prompts'
import type { EventLogEntry, JudgeSessionVerdict, Side, TopicId, TranscriptEntry } from './shared/types'

const JUDGE_VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    session_terminate: { type: 'boolean' },
    termination_reason: { type: ['string', 'null'] },
    respect_score: { type: 'integer', minimum: 0, maximum: 100 },
    argument_quality_score: { type: 'integer', minimum: 0, maximum: 100 },
    penalty_events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          turn: { type: 'integer' },
          type: {
            type: 'string',
            enum: ['interruption', 'yelling', 'insult', 'dismissiveness'],
          },
          source: { type: 'string', enum: ['event_log', 'judge_detected'] },
        },
        required: ['turn', 'type', 'source'],
        additionalProperties: false,
      },
    },
    fact_checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          turn: { type: 'integer' },
          claim: { type: 'string' },
          status: { type: 'string', enum: ['verified', 'contradicted', 'unverified'] },
          fact_id: { type: ['string', 'null'] },
        },
        required: ['turn', 'claim', 'status', 'fact_id'],
        additionalProperties: false,
      },
    },
    result: { type: 'string', enum: ['pass', 'needs_work'] },
    feedback_summary: { type: 'string' },
    topics_for_resource_screen: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'session_terminate',
    'termination_reason',
    'respect_score',
    'argument_quality_score',
    'penalty_events',
    'fact_checks',
    'result',
    'feedback_summary',
    'topics_for_resource_screen',
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

function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      vertexai: true,
      project: GCP_PROJECT,
      location: VERTEX_LOCATION,
    })
  }
  return client
}

export function formatTranscript(transcript: TranscriptEntry[]): string {
  if (!transcript.length) {
    return '(no speech yet)'
  }
  return transcript
    .map((entry, index) => {
      const label = entry.speaker === 'user' ? 'USER' : 'AI OPPONENT'
      const body =
        entry.speaker === 'user'
          ? markUntrustedUserSpeech(entry.text)
          : entry.text.trim()
      return `[${index + 1}] ${label}: ${body}`
    })
    .join('\n')
}

export interface SessionJudgeParams {
  topic: TopicId
  debaterSide: Side
  transcript: TranscriptEntry[]
  eventLog: EventLogEntry[]
  /** User argued their diagnostic-assigned side (always true in this app). */
  userArguedOwnPosition: boolean
}

/**
 * End-of-session judge — separate structured call from the Live opponent.
 * Temperature 0; low thinking.
 */
export async function runSessionJudge(params: SessionJudgeParams): Promise<JudgeSessionVerdict> {
  const systemInstruction = renderJudgeSystemPrompt(PROMPTS.judge)

  const payload = {
    TOPIC_FACT_BANK: JSON.parse(getTopicFactBankJson(params.topic)),
    TRANSCRIPT: formatTranscript(params.transcript),
    EVENT_LOG: params.eventLog,
    ASSIGNMENT_CONTEXT: {
      user_argued_own_position: params.userArguedOwnPosition,
      ai_opponent_side: params.debaterSide,
      note: 'Use assignment context only for feedback_summary tone, never for scoring.',
    },
  }

  const raw = await generateJson({
    systemInstruction,
    schema: JUDGE_VERDICT_SCHEMA,
    contents: JSON.stringify(payload, null, 2),
    temperature: 0,
  })

  return normalizeJudgeVerdict(raw)
}

export interface TakeawaysParams {
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
      systemInstruction,
      schema: TAKEAWAYS_SCHEMA,
      contents: `Transcript:\n\n${formatTranscript(params.transcript)}\n\nWrite the takeaways.`,
      temperature: 0,
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
    logger.error('Takeaway generation failed', error)
    return [
      'Personalized feedback could not be generated for this debate.',
      'Your scores below still reflect how the conversation went.',
    ]
  }
}

interface GenerateJsonParams {
  systemInstruction: string
  schema: unknown
  contents: string
  temperature: number
}

async function generateJson(params: GenerateJsonParams): Promise<unknown> {
  const ai = getClient()
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
          temperature: params.temperature,
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
