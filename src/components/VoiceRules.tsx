import { useState } from 'react'

import { INTERRUPTIONS_TO_LOSE } from '@shared/conduct'
import { debateTimeLimitMinutes } from '@shared/debateConfig'
import AppearingLine from './AppearingLine'
import OnboardingTopBrand from './OnboardingTopBrand'
import { stageShellStyle, textSlotStyle } from '../onboardingLayout'
import * as s from '../theme'

/** Persist so returning users skip the carousel unless they open Rules. */
export const VOICE_RULES_SEEN_KEY = 'cmm-voice-rules-seen'

export function hasSeenVoiceRules(): boolean {
  try {
    return localStorage.getItem(VOICE_RULES_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markVoiceRulesSeen(): void {
  try {
    localStorage.setItem(VOICE_RULES_SEEN_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}

type Stage = 'intro' | 'rule1' | 'rule2' | 'rule3' | 'rule4' | 'rule5' | 'rule6'

type Props = {
  onDone: () => void
}

/**
 * Voice debate rules carousel. Shown once before the mic gate; reopenable
 * via the Rules button on the debate intro.
 */
export default function VoiceRules({ onDone }: Props) {
  const [stage, setStage] = useState<Stage>('intro')

  function finish() {
    markVoiceRulesSeen()
    onDone()
  }

  return (
    <div style={{ ...stageShellStyle, background: 'transparent' }}>
      <OnboardingTopBrand />
      <button
        type="button"
        onClick={finish}
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
      <div
        style={{
          ...textSlotStyle,
          height: 'auto',
          overflow: 'visible',
        }}
      >
        {stage === 'intro' && (
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
            text={`6. ${INTERRUPTIONS_TO_LOSE} interruptions end the debate. We will show your count as you go.`}
            holdMs={900}
            onDone={finish}
          />
        )}
      </div>
    </div>
  )
}
