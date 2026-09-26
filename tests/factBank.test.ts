import { describe, expect, it } from 'vitest'

import {
  formatFactBankForPrompt,
  getTopicFactSheet,
  listResourceLinks,
} from '../shared/factBank'
import { TOPIC_IDS } from '../shared/topics'

describe('fact bank', () => {
  it('has a sheet for every debate topic', () => {
    for (const id of TOPIC_IDS) {
      const sheet = getTopicFactSheet(id)
      expect(sheet.facts.length).toBeGreaterThanOrEqual(5)
      expect(sheet.neutral_framing.length).toBeGreaterThan(20)
      expect(sheet.resources.neutral.url).toMatch(/^https:\/\//)
    }
  })

  it('formats prompts with ids and sources', () => {
    const block = formatFactBankForPrompt('guns')
    expect(block).toContain('[gc1]')
    expect(block).toContain('Verified facts')
    expect(block).not.toContain('{{')
  })

  it('lists five curated resource links per topic', () => {
    expect(listResourceLinks('economy')).toHaveLength(5)
  })
})
