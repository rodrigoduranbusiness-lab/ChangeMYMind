import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import type { DebateModality } from '@shared/types'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { DIFFICULTY_KEY } from './Briefing'
import { getDebateChoice, saveModality } from '../lib/dailyChoice'
import {
  cancelTextLobbyPrefetch,
  prefetchLiveAccess,
  prefetchTextLobby,
} from '../lib/api'
import { stageShellStyle } from '../onboardingLayout'
import * as s from '../theme'

export default function Mode() {
  const navigate = useNavigate()
  const choice = getDebateChoice()

  useEffect(() => {
    if (!choice) {
      navigate('/today', { replace: true })
    }
  }, [choice, navigate])

  function pick(modality: DebateModality) {
    if (!choice) return
    saveModality(modality)
    if (!sessionStorage.getItem(DIFFICULTY_KEY)) {
      sessionStorage.setItem(DIFFICULTY_KEY, 'medium')
    }
    if (modality === 'voice') {
      cancelTextLobbyPrefetch()
      prefetchLiveAccess()
      navigate('/debate', { replace: true })
      return
    }
    // Single warm join — TextDebate owns heartbeat / match wait.
    prefetchTextLobby(choice.topicId, choice.stance)
    navigate('/text', { replace: true })
  }

  if (!choice) return null

  return (
    <div
      style={{
        ...stageShellStyle,
        background: 'transparent',
        color: s.color.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        paddingTop: `max(88px, calc(env(safe-area-inset-top) + 78px))`,
        paddingBottom: `max(32px, env(safe-area-inset-bottom))`,
      }}
    >
      <OnboardingTopBrand />
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <p style={{ ...s.kicker, margin: '0 0 10px' }}>How do you want to debate?</p>
        <h1 style={{ ...s.heading, fontSize: 26, marginBottom: 28 }}>Voice or text</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={() => pick('voice')}
            style={{ ...s.buttonPrimary, minHeight: 64, fontSize: 18 }}
          >
            Voice
          </button>
          <button
            type="button"
            onClick={() => pick('text')}
            style={{ ...s.buttonSecondary, minHeight: 64, fontSize: 18 }}
          >
            Text
          </button>
        </div>
        <p style={{ ...s.subheading, marginTop: 20, fontSize: 14 }}>
          Text will try to match you with someone arguing the other side. If no one is
          around, you debate Huey.
        </p>
      </div>
    </div>
  )
}
