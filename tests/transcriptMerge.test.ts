import { describe, expect, it } from 'vitest'

import { mergeTranscriptAppend, sanitizeTranscriptList } from '../shared/transcriptMerge'
import type { TranscriptEntry } from '../shared/types'

describe('mergeTranscriptAppend', () => {
  const base: TranscriptEntry[] = [
    { speaker: 'user', text: 'Hello', ts: 1 },
    { speaker: 'ai', text: 'Hi there', ts: 2 },
  ]

  it('appends new entries', () => {
    const incoming: TranscriptEntry[] = [{ speaker: 'user', text: 'Next point', ts: 3 }]
    expect(mergeTranscriptAppend(base, incoming)).toHaveLength(3)
  })

  it('skips duplicates', () => {
    const incoming: TranscriptEntry[] = [
      { speaker: 'user', text: 'Hello', ts: 1 },
      { speaker: 'ai', text: 'New', ts: 4 },
    ]
    const merged = mergeTranscriptAppend(base, incoming)
    expect(merged).toHaveLength(3)
    expect(merged[2]?.text).toBe('New')
  })
})

describe('sanitizeTranscriptList', () => {
  it('filters invalid rows', () => {
    const list = sanitizeTranscriptList([
      { speaker: 'user', text: ' ok ', ts: 1 },
      { speaker: 'bot', text: 'nope', ts: 2 },
      null,
    ])
    expect(list).toEqual([{ speaker: 'user', text: 'ok', ts: 1 }])
  })
})
