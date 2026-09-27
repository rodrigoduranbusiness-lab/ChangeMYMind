import { describe, expect, it } from 'vitest'

import {
  extractUserArgumentLines,
  formatHueyDailyContext,
  parseSanitizeJson,
} from '../shared/huey'
import type { HueyDayDoc, TranscriptEntry } from '../shared/types'

describe('Huey sanitize parse', () => {
  it('accepts a safe payload', () => {
    const result = parseSanitizeJson(
      JSON.stringify({
        safe: true,
        summary: 'Strong tradeoff framing on gun licensing.',
        mannerisms: ['asks clarifying questions'],
        argumentPoints: ['Licensing can coexist with rights'],
        styleTags: ['calm', 'Socratic'],
      }),
    )
    expect(result.safe).toBe(true)
    if (result.safe) {
      expect(result.summary).toContain('tradeoff')
      expect(result.argumentPoints).toHaveLength(1)
    }
  })

  it('rejects unsafe or empty payloads', () => {
    expect(parseSanitizeJson('{"safe":false,"reason":"slurs"}').safe).toBe(false)
    expect(parseSanitizeJson('{"safe":true,"summary":"","argumentPoints":[]}').safe).toBe(false)
    expect(parseSanitizeJson('not-json').safe).toBe(false)
  })
})

describe('Huey extract / format', () => {
  it('keeps only recent user lines', () => {
    const transcript: TranscriptEntry[] = [
      { speaker: 'ai', text: 'I disagree.', ts: 1 },
      { speaker: 'user', text: 'Short', ts: 2 },
      { speaker: 'user', text: 'A longer civil argument about evidence and tradeoffs.', ts: 3 },
    ]
    const lines = extractUserArgumentLines(transcript)
    expect(lines).toEqual(['A longer civil argument about evidence and tradeoffs.'])
  })

  it('formats daily context and truncates gracefully', () => {
    const doc: HueyDayDoc = {
      topicId: 'guns',
      updatedAt: 1,
      contributions: [
        {
          uidHash: 'abc',
          stance: 'left',
          summary: 'Licensing argument',
          mannerisms: ['calm'],
          argumentPoints: ['Background checks'],
          createdAt: 1,
        },
      ],
    }
    const text = formatHueyDailyContext(doc)
    expect(text).toContain('Licensing argument')
    expect(formatHueyDailyContext(null)).toMatch(/No prior winner/)
  })
})
