import type { HueyDayDoc, Side, TranscriptEntry } from './types'

export const MAX_HUEY_CONTRIBUTIONS_PER_DAY = 40
export const MAX_HUEY_CONTEXT_CHARS = 4000
export const MAX_HUEY_USER_LINES = 12
export const MAX_HUEY_LINE_CHARS = 400

export const EMPTY_HUEY_CONTEXT = 'No prior winner lessons yet today.'

export const HUEY_CONDUCT_LOSS_REASONS = new Set([
  'hate_speech',
  'incivility',
  'yelling',
  'conduct_cap',
  'interruptions',
])

/** Pull recent user argument lines — not a raw toxic dump. */
export function extractUserArgumentLines(transcript: TranscriptEntry[]): string[] {
  return (transcript ?? [])
    .filter((e) => e.speaker === 'user' && typeof e.text === 'string')
    .map((e) => e.text.trim().slice(0, MAX_HUEY_LINE_CHARS))
    .filter((t) => t.length > 8)
    .slice(-MAX_HUEY_USER_LINES)
}

export interface SanitizedHueyPayload {
  safe: true
  summary: string
  mannerisms: string[]
  argumentPoints: string[]
  styleTags: string[]
}

export type SanitizeResult = SanitizedHueyPayload | { safe: false; reason: string }

function clipList(values: unknown, max: number): string[] {
  if (!Array.isArray(values)) return []
  return values
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max)
}

export function parseSanitizeJson(raw: string): SanitizeResult {
  const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { safe: false, reason: 'invalid_json' }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { safe: false, reason: 'invalid_shape' }
  }
  const obj = parsed as Record<string, unknown>
  if (obj.safe !== true) {
    return {
      safe: false,
      reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 120) : 'rejected',
    }
  }
  const summary = typeof obj.summary === 'string' ? obj.summary.trim().slice(0, 400) : ''
  const argumentPoints = clipList(obj.argumentPoints, 6)
  if (!summary && argumentPoints.length === 0) {
    return { safe: false, reason: 'empty' }
  }
  return {
    safe: true,
    summary: summary || argumentPoints[0]!,
    mannerisms: clipList(obj.mannerisms, 5),
    argumentPoints,
    styleTags: clipList(obj.styleTags, 4),
  }
}

/**
 * Format today's contributions for injection as HUEY_DAILY_CONTEXT (~2–4k chars).
 */
export function formatHueyDailyContext(doc: HueyDayDoc | null | undefined): string {
  if (!doc?.contributions?.length) {
    return EMPTY_HUEY_CONTEXT
  }

  const lines: string[] = [
    `Topic: ${doc.topicId}. Lessons from ${doc.contributions.length} winner(s) today:`,
  ]

  const newestFirst = [...doc.contributions].reverse()
  for (const c of newestFirst) {
    const block = [
      `- [${c.stance}] ${c.summary}`,
      c.argumentPoints.length ? `  Points: ${c.argumentPoints.join('; ')}` : '',
      c.mannerisms.length ? `  Manner: ${c.mannerisms.join('; ')}` : '',
      c.styleTags?.length ? `  Style: ${c.styleTags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    if (lines.join('\n').length + block.length + 1 > MAX_HUEY_CONTEXT_CHARS) break
    lines.push(block)
  }

  return lines.join('\n').slice(0, MAX_HUEY_CONTEXT_CHARS)
}

export function isHueyClearWin(status: string, outcomeReason: string | null | undefined): boolean {
  if (status !== 'passed' && status !== 'won') return false
  if (outcomeReason && HUEY_CONDUCT_LOSS_REASONS.has(outcomeReason)) return false
  return true
}

export type { Side }
