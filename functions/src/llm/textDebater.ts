import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { logger } from 'firebase-functions'

import {
  AI_PROVIDER,
  GCP_PROJECT,
  GROK_API_BASE,
  GROK_JUDGE_MODEL,
  JUDGE_MODEL,
  VERTEX_LOCATION,
  requireXaiApiKey,
} from '../config'
import { PROMPTS } from '../generated/prompts'
import { renderOpponentPrompt } from '../shared/prompts'
import type { Side, TopicId, TranscriptEntry } from '../shared/types'
import { formatTranscript } from './transcript'

let vertexClient: GoogleGenAI | undefined

function getVertexClient(): GoogleGenAI {
  if (!vertexClient) {
    vertexClient = new GoogleGenAI({
      vertexai: true,
      project: GCP_PROJECT,
      location: VERTEX_LOCATION,
    })
  }
  return vertexClient
}

export interface TextDebaterParams {
  topic: TopicId
  debaterSide: Side
  transcript: TranscriptEntry[]
  hueyDailyContext?: string
}

/**
 * Non-live text rebuttal using the same Huey debater system prompt as Live voice.
 */
export async function runTextDebaterReply(params: TextDebaterParams): Promise<string> {
  const systemInstruction = renderOpponentPrompt(
    PROMPTS.debater,
    params.topic,
    params.debaterSide,
    params.hueyDailyContext,
  )
  const contents =
    `Continue this debate in character. Reply in 2–5 short sentences of plain text ` +
    `(no markdown, no stage directions). Argue your side; engage the user's latest point.\n\n` +
    `Transcript so far:\n${formatTranscript(params.transcript)}`

  if (AI_PROVIDER === 'grok') {
    return generateTextGrok(systemInstruction, contents)
  }
  return generateTextVertex(systemInstruction, contents)
}

async function generateTextVertex(systemInstruction: string, contents: string): Promise<string> {
  const ai = getVertexClient()
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: JUDGE_MODEL,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      })
      const text = response.text?.trim()
      if (!text) throw new Error('Empty text debater reply')
      return text.slice(0, 2000)
    } catch (error) {
      lastError = error
      logger.warn(`Vertex text debater failed (attempt ${attempt + 1})`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Vertex text debater failed')
}

async function generateTextGrok(systemInstruction: string, contents: string): Promise<string> {
  const apiKey = requireXaiApiKey()
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${GROK_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROK_JUDGE_MODEL,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: contents },
          ],
        }),
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Grok HTTP ${response.status}: ${body.slice(0, 400)}`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = payload.choices?.[0]?.message?.content?.trim()
      if (!text) throw new Error('Empty Grok text debater reply')
      return text.slice(0, 2000)
    } catch (error) {
      lastError = error
      logger.warn(`Grok text debater failed (attempt ${attempt + 1})`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Grok text debater failed')
}
