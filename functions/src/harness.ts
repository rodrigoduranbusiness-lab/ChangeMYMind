/**
 * Text-only test harness for the judge.
 *
 * Runs the real judge prompt against fixture transcripts with no Firestore, no
 * Live API, and no audio, so the rubric can be tuned quickly and checked for
 * side-bias.
 *
 *   GEMINI_API_KEY=... npm --prefix functions run harness
 *   GEMINI_API_KEY=... npm --prefix functions run harness -- strong_case
 *   GEMINI_API_KEY=... npm --prefix functions run harness -- --file transcript.txt --topic guns --debater right
 */
import { readFileSync } from 'node:fs'

import { FIXTURES, NEUTRALITY_PAIR } from './fixtures'
import type { JudgeFixture } from './fixtures'
import { runJudge } from './gemini'
import { decideOutcome, effectivePersuasion } from './shared/rules'
import type { JudgeScores, Side, TopicId, TranscriptEntry } from './shared/types'

const CRITERIA = [
  'evidence_reasoning',
  'civility_tone',
  'acknowledges_tradeoffs',
  'addresses_ai_points',
] as const

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('GEMINI_API_KEY is not set.')
    process.exit(1)
  }
  return key
}

function parseTranscriptFile(path: string): TranscriptEntry[] {
  let ts = Date.now()
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(user|ai|debater)\s*:\s*(.*)$/i.exec(line)
      if (!match) {
        throw new Error(`Could not parse line (expected "USER: ..." or "AI: ..."): ${line}`)
      }
      ts += 20_000
      return {
        speaker: match[1].toLowerCase() === 'user' ? ('user' as const) : ('ai' as const),
        text: match[2],
        ts,
      }
    })
}

function formatScores(scores: JudgeScores): string {
  const parts = CRITERIA.map((key) => `${key.split('_')[0]} ${String(scores[key]).padStart(2)}`)
  parts.push(`persuasion ${String(scores.persuasion).padStart(3)}`)
  if (scores.gaming_detected) {
    parts.push('GAMING')
  }
  return parts.join('  |  ')
}

function checkExpectations(fixture: JudgeFixture, scores: JudgeScores): string[] {
  const failures: string[] = []
  const { expect } = fixture

  if (expect.persuasionBelow !== undefined && scores.persuasion >= expect.persuasionBelow) {
    failures.push(`persuasion ${scores.persuasion} should be < ${expect.persuasionBelow}`)
  }
  if (expect.persuasionAtLeast !== undefined && scores.persuasion < expect.persuasionAtLeast) {
    failures.push(`persuasion ${scores.persuasion} should be >= ${expect.persuasionAtLeast}`)
  }
  if (expect.civilityAtMost !== undefined && scores.civility_tone > expect.civilityAtMost) {
    failures.push(`civility ${scores.civility_tone} should be <= ${expect.civilityAtMost}`)
  }
  if (expect.civilityAtLeast !== undefined && scores.civility_tone < expect.civilityAtLeast) {
    failures.push(`civility ${scores.civility_tone} should be >= ${expect.civilityAtLeast}`)
  }
  if (expect.gaming !== undefined && scores.gaming_detected !== expect.gaming) {
    failures.push(`gaming_detected ${scores.gaming_detected} should be ${expect.gaming}`)
  }

  return failures
}

async function judgeFixture(fixture: JudgeFixture): Promise<JudgeScores> {
  return runJudge({
    apiKey: apiKey(),
    topic: fixture.topic,
    debaterSide: fixture.debaterSide,
    transcript: fixture.transcript,
  })
}

async function runFixtures(selected: string[]): Promise<number> {
  const fixtures = selected.length
    ? FIXTURES.filter((f) => selected.includes(f.name))
    : FIXTURES

  if (!fixtures.length) {
    console.error(`No fixtures matched. Available: ${FIXTURES.map((f) => f.name).join(', ')}`)
    return 1
  }

  let failed = 0

  for (const fixture of fixtures) {
    const scores = await judgeFixture(fixture)
    const failures = checkExpectations(fixture, scores)
    const decision = decideOutcome([scores])

    console.log(`\n${failures.length ? 'FAIL' : 'ok  '}  ${fixture.name}`)
    console.log(`      ${fixture.description}`)
    console.log(`      ${formatScores(scores)}`)
    console.log(
      `      effective persuasion ${effectivePersuasion(scores)} -> ${decision.outcome}${
        decision.reason ? ` (${decision.reason})` : ''
      }`,
    )
    console.log(`      rationale: ${scores.rationale}`)

    for (const failure of failures) {
      console.log(`      ! ${failure}`)
      failed++
    }
  }

  return failed ? 1 : 0
}

/**
 * The judge must score the same debating behavior identically regardless of
 * which side the user argues. Large gaps here mean the rubric in
 * /prompts/judge.md is leaking a political preference.
 */
async function runNeutralityCheck(): Promise<number> {
  console.log('\n--- neutrality check (same behavior, opposite sides) ---')

  const [left, right] = await Promise.all(NEUTRALITY_PAIR.map(judgeFixture))

  console.log(`  user argues left:   ${formatScores(left)}`)
  console.log(`  user argues right:  ${formatScores(right)}`)

  let worst = 0
  for (const key of CRITERIA) {
    const gap = Math.abs(left[key] - right[key])
    worst = Math.max(worst, gap)
    console.log(`  ${key.padEnd(24)} gap ${gap}`)
  }

  const persuasionGap = Math.abs(left.persuasion - right.persuasion)
  console.log(`  ${'persuasion'.padEnd(24)} gap ${persuasionGap}`)

  // Generous thresholds: these are two different arguments, so some difference
  // is expected. A large gap is the signal worth investigating.
  const criteriaFail = worst > 3
  const persuasionFail = persuasionGap > 20

  if (criteriaFail || persuasionFail) {
    console.log('\n  FAIL  the judge appears to favor one side; review /prompts/judge.md')
    return 1
  }
  console.log('\n  ok    scores are comparable across sides')
  return 0
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  const fileIndex = args.indexOf('--file')
  if (fileIndex !== -1) {
    const path = args[fileIndex + 1]
    const topic = (valueFor(args, '--topic') ?? 'guns') as TopicId
    const debaterSide = (valueFor(args, '--debater') ?? 'right') as Side

    const scores = await runJudge({
      apiKey: apiKey(),
      topic,
      debaterSide,
      transcript: parseTranscriptFile(path),
    })

    console.log(formatScores(scores))
    console.log(`rationale: ${scores.rationale}`)
    console.log(`decision: ${JSON.stringify(decideOutcome([scores]))}`)
    return
  }

  const skipNeutrality = args.includes('--no-neutrality')
  const fixtureNames = args.filter((arg) => !arg.startsWith('--'))

  const fixtureStatus = await runFixtures(fixtureNames)
  const neutralityStatus =
    skipNeutrality || fixtureNames.length ? 0 : await runNeutralityCheck()

  process.exitCode = fixtureStatus || neutralityStatus
}

function valueFor(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
