import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  debateContext,
  fillPlaceholders,
  renderJudgeSystemPrompt,
  renderOpponentPrompt,
  renderPrompt,
  stripPromptPreamble,
} from '../shared/prompts'
import { TOPICS, oppositeSide } from '../shared/topics'
import type { Side } from '../shared/types'

const PROMPT_FILES = ['debater', 'judge', 'takeaways'] as const

function loadPrompt(name: string): string {
  return readFileSync(new URL(`../prompts/${name}.md`, import.meta.url), 'utf8')
}

const SIDES: Side[] = ['left', 'right']

describe('stripPromptPreamble', () => {
  it('drops the reviewer notes above the divider', () => {
    const raw = ['# Title', '', 'Notes for humans.', '', '---', '', 'You are a debater.'].join('\n')
    expect(stripPromptPreamble(raw)).toBe('You are a debater.')
  })

  it('returns the whole file when there is no divider', () => {
    expect(stripPromptPreamble('Just instructions.')).toBe('Just instructions.')
  })

  it('keeps dividers that appear later in the instructions', () => {
    const raw = ['# Title', '---', 'First line.', '', '---', '', 'Second section.'].join('\n')
    expect(stripPromptPreamble(raw)).toContain('Second section.')
  })
})

describe('fillPlaceholders', () => {
  it('substitutes every placeholder', () => {
    expect(fillPlaceholders('Hello {{NAME}}, {{NAME}}.', { NAME: 'world' })).toBe(
      'Hello world, world.',
    )
  })

  it('throws rather than shipping an unfilled placeholder to the model', () => {
    expect(() => fillPlaceholders('Topic: {{TOPIC_LABEL}}', {})).toThrow('TOPIC_LABEL')
  })
})

describe('prompt rendering', () => {
  it('renders every prompt for every topic and both sides', () => {
    for (const name of PROMPT_FILES) {
      const raw = loadPrompt(name)

      if (name === 'judge') {
        const rendered = renderJudgeSystemPrompt(raw)
        expect(rendered).not.toContain('{{')
        expect(rendered).not.toContain('Neutrality contract')
        expect(rendered.length).toBeGreaterThan(200)
        continue
      }

      for (const topic of TOPICS) {
        for (const side of SIDES) {
          const rendered =
            name === 'debater'
              ? renderOpponentPrompt(raw, topic.id, side)
              : renderPrompt(raw, topic.id, side, { OUTCOME: 'Time ran out.' })

          expect(rendered).not.toContain('{{')
          expect(rendered).not.toContain('Neutrality contract')
          expect(rendered.length).toBeGreaterThan(200)
        }
      }
    }
  })

  it('gives the debater the side it was assigned, not the user\'s side', () => {
    for (const topic of TOPICS) {
      for (const side of SIDES) {
        const context = debateContext(topic.id, side)
        expect(context.DEBATER_POSITION).toBe(topic.positions[side])
        expect(context.USER_POSITION).toBe(topic.positions[oppositeSide(side)])
      }
    }
  })
})

describe('neutrality guards', () => {
  /**
   * A one-liner for one side and a paragraph for the other would produce an
   * unevenly matched debater even with a perfectly neutral prompt.
   */
  it('states both sides of every topic at comparable length', () => {
    for (const topic of TOPICS) {
      const left = topic.positions.left.length
      const right = topic.positions.right.length
      const ratio = Math.max(left, right) / Math.min(left, right)

      expect(ratio, `${topic.id} positions are lopsided`).toBeLessThan(1.35)
    }
  })

  it('renders the debater prompt at the same length for both sides, give or take the position', () => {
    for (const topic of TOPICS) {
      const raw = loadPrompt('debater')
      const left = renderOpponentPrompt(raw, topic.id, 'left').length
      const right = renderOpponentPrompt(raw, topic.id, 'right').length

      // Any large asymmetry means the template itself treats the sides
      // differently rather than just swapping the injected positions.
      expect(Math.abs(left - right)).toBeLessThan(80)
    }
  })

  it('describes both sides with the same sentence frame', () => {
    for (const side of SIDES) {
      const context = debateContext('guns', side)
      expect(context.DEBATER_SIDE).toMatch(/^(left|right)-leaning$/)
      expect(context.USER_SIDE).toMatch(/^(left|right)-leaning$/)
      expect(context.DEBATER_SIDE).not.toBe(context.USER_SIDE)
    }
  })
})
