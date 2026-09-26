/**
 * Text-only test harness for the session judge.
 *
 *   npm --prefix functions run harness
 *   npm --prefix functions run harness -- --file transcript.txt --topic guns --debater right
 */
import { readFileSync } from 'node:fs'

import { FIXTURES, NEUTRALITY_PAIR } from './fixtures'
import type { JudgeFixture } from './fixtures'
import { runSessionJudge } from './gemini'
import { decideOutcomeFromVerdict } from './shared/rules'
import type { JudgeSessionVerdict, Side, TopicId, TranscriptEntry } from './shared/types'

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

function formatVerdict(verdict: JudgeSessionVerdict): string {
  return `respect ${verdict.respect_score}  |  quality ${verdict.argument_quality_score}  |  ${verdict.result}  |  penalties ${verdict.penalty_events.length}`
}

async function judgeFixture(fixture: JudgeFixture): Promise<JudgeSessionVerdict> {
  return runSessionJudge({
    topic: fixture.topic,
    debaterSide: fixture.debaterSide,
    transcript: fixture.transcript,
    eventLog: [],
    userArguedOwnPosition: true,
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

  for (const fixture of fixtures) {
    const verdict = await judgeFixture(fixture)
    const decision = decideOutcomeFromVerdict(verdict)

    console.log(`\nok    ${fixture.name}`)
    console.log(`      ${fixture.description}`)
    console.log(`      ${formatVerdict(verdict)}`)
    console.log(
      `      -> ${decision.outcome}${decision.reason ? ` (${decision.reason})` : ''}`,
    )
    console.log(`      feedback: ${verdict.feedback_summary}`)
  }

  return 0
}

async function runNeutralityCheck(): Promise<number> {
  console.log('\n--- neutrality check (same behavior, opposite sides) ---')

  const [left, right] = await Promise.all(NEUTRALITY_PAIR.map(judgeFixture))

  console.log(`  user argues left:   ${formatVerdict(left)}`)
  console.log(`  user argues right:  ${formatVerdict(right)}`)

  const respectGap = Math.abs(left.respect_score - right.respect_score)
  const qualityGap = Math.abs(left.argument_quality_score - right.argument_quality_score)
  console.log(`  respect gap ${respectGap}`)
  console.log(`  quality gap ${qualityGap}`)

  if (respectGap > 15 || qualityGap > 15) {
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

    const verdict = await runSessionJudge({
      topic,
      debaterSide,
      transcript: parseTranscriptFile(path),
      eventLog: [],
      userArguedOwnPosition: true,
    })

    console.log(formatVerdict(verdict))
    console.log(`feedback: ${verdict.feedback_summary}`)
    console.log(`decision: ${JSON.stringify(decideOutcomeFromVerdict(verdict))}`)
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
