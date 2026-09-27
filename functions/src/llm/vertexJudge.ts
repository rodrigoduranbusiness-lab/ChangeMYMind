import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { logger } from 'firebase-functions'

import { GCP_PROJECT, JUDGE_MODEL, VERTEX_LOCATION } from '../config'
import { PROMPTS } from '../generated/prompts'
import { getTopicFactBankJson } from '../shared/factBank'
import { normalizeJudgeVerdict } from '../shared/judgeVerdict'
import { renderJudgeSystemPrompt, renderPrompt } from '../shared/prompts'
import type { EventLogEntry, JudgeSessionVerdict, Side, TopicId, TranscriptEntry } from '../shared/types'
import { JUDGE_VERDICT_SCHEMA, TAKEAWAYS_SCHEMA } from './schemas'
import { formatTranscript } from './transcript'

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

export interface SessionJudgeParams {
  topic: TopicId
  debaterSide: Side
  transcript: TranscriptEntry[]
  eventLog: EventLogEntry[]
  userArguedOwnPosition: boolean
}

export async function runSessionJudgeVertex(params: SessionJudgeParams): Promise<JudgeSessionVerdict> {
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

  const raw = await generateJsonVertex({
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

export async function runTakeawaysVertex(params: TakeawaysParams): Promise<string[]> {
  const systemInstruction = renderPrompt(PROMPTS.takeaways, params.topic, params.debaterSide, {
    OUTCOME: params.outcome,
  })

  try {
    const raw = await generateJsonVertex({
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
    logger.error('Takeaway generation failed (Vertex)', error)
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

async function generateJsonVertex(params: GenerateJsonParams): Promise<unknown> {
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
      logger.warn(`Vertex JSON call failed (attempt ${attempt + 1})`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Vertex JSON call failed')
}
