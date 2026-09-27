import { describe, expect, it } from 'vitest'

import { parseAiProvider } from '../shared/aiProvider'

describe('parseAiProvider', () => {
  it('defaults to vertex', () => {
    expect(parseAiProvider(undefined)).toBe('vertex')
    expect(parseAiProvider('')).toBe('vertex')
  })

  it('accepts grok', () => {
    expect(parseAiProvider('grok')).toBe('grok')
    expect(parseAiProvider(' GROK ')).toBe('grok')
  })
})
