import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { debateTimeLimitMinutes } from '@shared/debateConfig'
import { getTopic, sideLabel } from '@shared/topics'
import type { Side } from '@shared/types'
import { useAuth } from '../auth/context'
import AppearingLine from '../components/AppearingLine'
import FadeLine from '../components/FadeLine'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { stageShellStyle, textSlotStyle } from '../onboardingLayout'
import * as s from '../theme'

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_KEY = 'cmm-difficulty'

const CONFIRM_MS = 500

type Stage =
  | 'difficultyPrompt'
  | 'difficultyChoices'
  | 'notice'
  | 'rulesIntro'
  | 'rule1'
  | 'rule2'
  | 'rule3'
  | 'rule4'
  | 'rule5'
  | 'rule6'
  | 'topicLabel'
  | 'topicName'
  | 'topicSide'
  | 'tipBudging'
  | 'balanced'

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]

/**
 * Post-quiz briefing: difficulty, disclosure, rules, then topic reveal —
 * all in the appearing-text language. Debate page is mic + begin only.
 */
export default function Briefing() {
  const navigate = useNavigate()
  const { diagnostic, refreshDiagnostic } = useAuth()
  const [stage, setStage] = useState<Stage>('difficultyPrompt')
  const [picked, setPicked] = useState<Difficulty | null>(null)
  const [topicSideReady, setTopicSideReady] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (stage === 'topicSide') {
      setTopicSideReady(false)
    }
  }, [stage])

  useEffect(() => {
    void refreshDiagnostic()
  }, [refreshDiagnostic])

  useEffect(() => {
    if (!diagnostic?.assignedTopic) {
      navigate('/diagnostic', { replace: true })
    }
  }, [diagnostic, navigate])

  useEffect(() => {
    return () => {
      for (const id of timers.current) clearTimeout(id)
    }
  }, [])

  const topicId = diagnostic?.assignedTopic
  const topic = topicId ? getTopic(topicId) : null
  const userLean = topicId ? (diagnostic?.topicLeans?.[topicId] ?? 0) : 0
  const leanIsKnown = userLean !== 0
  const debaterSide: Side = userLean > 0 ? 'left' : 'right'

  const sideRevealLine = useMemo(() => {
    if (!topic || !leanIsKnown) return ''
    return `Huey will argue the ${sideLabel(debaterSide)}-leaning side:\n\n${topic.positions[debaterSide]}`
  }, [topic, leanIsKnown, debaterSide])

  function schedule(ms: number, next: () => void) {
    const id = setTimeout(next, ms)
    timers.current.push(id)
  }

  function pickDifficulty(id: Difficulty) {
    if (picked) return
    sessionStorage.setItem(DIFFICULTY_KEY, id)
    setPicked(id)

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Hold confirmed selection, then cut to the next beat — no white flash.
    schedule(reduceMotion ? 0 : CONFIRM_MS, () => setStage('notice'))
  }

  function goTopic() {
    if (!topic) {
      navigate('/diagnostic', { replace: true })
      return
    }
    setStage(leanIsKnown ? 'topicLabel' : 'balanced')
  }

  function finishBriefing() {
    navigate('/debate', { replace: true })
  }

  /** Jump past rules/topic copy straight to the debate (question + mic). */
  function skipToDebate() {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
    if (!sessionStorage.getItem(DIFFICULTY_KEY)) {
      sessionStorage.setItem(DIFFICULTY_KEY, 'medium')
    }
    finishBriefing()
  }

  const onDifficulty =
    stage === 'difficultyPrompt' || stage === 'difficultyChoices'

  const canSkip = stage !== 'difficultyPrompt' && stage !== 'difficultyChoices'

  return (
    <div style={{ ...stageShellStyle, background: 'transparent' }}>
      <OnboardingTopBrand />
      {canSkip && (
        <button
          type="button"
          onClick={skipToDebate}
          style={{
            position: 'fixed',
            top: `max(16px, env(safe-area-inset-top))`,
            left: `max(24px, env(safe-area-inset-left))`,
            zIndex: 50,
            padding: '8px 12px',
            border: 'none',
            background: 'transparent',
            color: s.color.textFaint,
            fontFamily: s.font.serif,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Skip
        </button>
      )}
      <div
        style={{
          ...textSlotStyle,
          // Difficulty sits higher so the choices aren’t pinned mid/low screen.
          top: onDifficulty ? '26%' : textSlotStyle.top,
          height: 'auto',
          overflow: 'visible',
        }}
      >
        {stage === 'difficultyPrompt' && (
          <AppearingLine
            text="Select your difficulty"
            stay
            onDone={() => setStage('difficultyChoices')}
          />
        )}

        {stage === 'difficultyChoices' && (
          <div>
            <p
              style={{
                margin: 0,
                marginBottom: 28,
                fontSize: 24,
                fontWeight: 500,
                lineHeight: 1.4,
                color: s.color.text,
              }}
            >
              Select your difficulty
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                animation: 'cg-fade-up 600ms ease both',
              }}
            >
              {DIFFICULTIES.map((d) => {
                const active = picked === d.id
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={Boolean(picked)}
                    onClick={() => pickDifficulty(d.id)}
                    style={{
                      ...(active ? s.buttonPrimary : s.buttonSecondary),
                      minHeight: 48,
                      fontSize: 16,
                      cursor: picked ? 'default' : 'pointer',
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {stage === 'notice' && (
          <FadeLine
            text="Change My Mind uses AI. We will offset emissions and donate to water access funds from 9/26–9/27."
            holdMs={450}
            fadeMs={220}
            onDone={() => setStage('rulesIntro')}
          />
        )}

        {stage === 'rulesIntro' && (
          <AppearingLine
            text="Let's start with the rules."
            weight={700}
            onDone={() => setStage('rule1')}
          />
        )}

        {stage === 'rule1' && (
          <AppearingLine
            text={`1. You have ${debateTimeLimitMinutes()} minutes to change my mind.`}
            onDone={() => setStage('rule2')}
          />
        )}

        {stage === 'rule2' && (
          <AppearingLine text="2. Speak normally." onDone={() => setStage('rule3')} />
        )}

        {stage === 'rule3' && (
          <AppearingLine
            text="3. If you raise your voice or try to win by being loud, you will lose automatically."
            onDone={() => setStage('rule4')}
          />
        )}

        {stage === 'rule4' && (
          <AppearingLine
            text="4. Wait until Huey finishes speaking before you answer. Talking over it counts as an interruption."
            holdMs={900}
            onDone={() => setStage('rule5')}
          />
        )}

        {stage === 'rule5' && (
          <AppearingLine
            text="5. Keep each turn under 30 seconds so there is room for a reply. Long monologues count the same way."
            holdMs={900}
            onDone={() => setStage('rule6')}
          />
        )}

        {stage === 'rule6' && (
          <AppearingLine
            text="6. Four interruptions end the debate. We will show your count as you go."
            holdMs={900}
            onDone={goTopic}
          />
        )}

        {stage === 'balanced' && (
          <AppearingLine
            text="Your answers came out balanced on every topic, so we picked one for you. Huey will take a side and argue it hard — you will hear which one in the opening."
            holdMs={1000}
            onDone={() => setStage('topicLabel')}
          />
        )}

        {stage === 'topicLabel' && (
          <AppearingLine text="Your topic" onDone={() => setStage('topicName')} />
        )}

        {stage === 'topicName' && topic && (
          <AppearingLine
            text={topic.label}
            weight={700}
            holdMs={700}
            onDone={() => setStage(leanIsKnown ? 'topicSide' : 'tipBudging')}
          />
        )}

        {stage === 'topicSide' && (
          <div>
            <AppearingLine
              text={sideRevealLine}
              preLine
              stay
              onDone={() => setTopicSideReady(true)}
            />
            {topicSideReady && (
              <button
                type="button"
                onClick={() => setStage('tipBudging')}
                style={{
                  ...s.buttonPrimary,
                  minHeight: 48,
                  fontSize: 16,
                  marginTop: 96,
                  width: '100%',
                }}
              >
                Continue
              </button>
            )}
          </div>
        )}

        {stage === 'tipBudging' && (
          <AppearingLine
            text="It will not budge unless you give it a real reason to."
            onDone={finishBriefing}
          />
        )}
      </div>
    </div>
  )
}
