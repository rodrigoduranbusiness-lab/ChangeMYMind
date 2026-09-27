import { logger } from 'firebase-functions'

import { GROK_API_BASE, GROK_JUDGE_MODEL, requireXaiApiKey } from '../config'
import { PROMPTS } from '../generated/prompts'
import { getTopicFactBankJson } from '../shared/factBank'
import { normalizeJudgeVerdict } from '../shared/judgeVerdict'
import { renderJudgeSystemPrompt, renderPrompt } from '../shared/prompts'
import type { JudgeSessionVerdict } from '../shared/types'
import { JUDGE_VERDICT_SCHEMA, TAKEAWAYS_SCHEMA } from './schemas'
import { formatTranscript } from './transcript'
import type { SessionJudgeParams, TakeawaysParams } from './vertexJudge'

interface GenerateJsonParams {
  systemInstruction: string
  schema: unknown
  contents: string
  temperature: number
}

function schemaSystemAppend(schema: unknown): string {
  return `\n\nRespond with a single JSON object (no markdown fences) matching this schema:\n${JSON.stringify(schema)}`
}

async function generateJsonGrok(params: GenerateJsonParams): Promise<unknown> {
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
          temperature: params.temperature,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: params.systemInstruction + schemaSystemAppend(params.schema),
            },
            { role: 'user', content: params.contents },
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
      const text = payload.choices?.[0]?.message?.content
      if (!text?.trim()) {
        throw new Error('Grok returned an empty response')
      }
      return JSON.parse(text) as unknown
    } catch (error) {
      lastError = error
      logger.warn(`Grok JSON call failed (attempt ${attempt + 1})`, error)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Grok JSON call failed')
}

export async function runSessionJudgeGrok(params: SessionJudgeParams): Promise<JudgeSessionVerdict> {
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

  const raw = await generateJsonGrok({
    systemInstruction,
    schema: JUDGE_VERDICT_SCHEMA,
    contents: JSON.stringify(payload, null, 2),
    temperature: 0,
  })

  return normalizeJudgeVerdict(raw)
}

export async function runTakeawaysGrok(params: TakeawaysParams): Promise<string[]> {
  const systemInstruction = renderPrompt(PROMPTS.takeaways, params.topic, params.debaterSide, {
    OUTCOME: params.outcome,
  })

  try {
    const raw = await generateJsonGrok({
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
    logger.error('Takeaway generation failed (Grok)', error)
    return [
      'Personalized feedback could not be generated for this debate.',
      'Your scores below still reflect how the conversation went.',
    ]
  }
}
