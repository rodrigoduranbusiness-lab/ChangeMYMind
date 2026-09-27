import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Stance as StanceChoice } from '@shared/types'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { getTodayTopic, saveStance } from '../lib/dailyChoice'
import { stageShellStyle } from '../onboardingLayout'
import * as s from '../theme'

export default function Stance() {
  const navigate = useNavigate()
  const topic = getTodayTopic()
  const [showFacts, setShowFacts] = useState(false)

  function pick(stance: StanceChoice) {
    saveStance(stance)
    navigate('/mode')
  }

  return (
    <div
      style={{
        ...stageShellStyle,
        background: 'transparent',
        color: s.color.text,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        overflowY: 'auto',
        paddingTop: `max(96px, calc(env(safe-area-inset-top) + 88px))`,
        paddingBottom: `max(40px, env(safe-area-inset-bottom))`,
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
        <h1 style={{ ...s.heading, fontSize: 26, marginBottom: 12 }}>{topic.question}</h1>
        <p style={{ ...s.subheading, marginBottom: 22 }}>
          Pick the side you will argue. Huey takes the other side.
        </p>

        <button
          type="button"
          onClick={() => setShowFacts((v) => !v)}
          style={{
            ...s.buttonSecondary,
            margin: '0 0 12px',
            width: '100%',
            minHeight: 40,
            padding: '8px 14px',
            fontSize: 15,
            borderRadius: 8,
          }}
        >
          {showFacts ? 'Hide the facts' : 'See the facts'}
        </button>

        {showFacts && (
          <ul
            style={{
              margin: '0 0 24px',
              padding: '20px 0 8px',
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {topic.facts.map((fact) => (
              <li
                key={fact.id}
                style={{
                  margin: 0,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: s.color.textMuted,
                }}
              >
                {fact.claim}
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 13,
                    color: s.color.textFaint,
                  }}
                >
                  {fact.source}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: 12,
            width: '100%',
            marginTop: showFacts ? 0 : 10,
          }}
        >
          <button
            type="button"
            onClick={() => pick('for')}
            style={{
              ...s.tintedFill('rgba(212, 168, 74, 0.7)'),
              flex: 1,
              minHeight: 72,
              fontSize: 17,
              padding: '14px 12px',
              borderRadius: 8,
              border: 'none',
              color: '#ffe9b8',
              fontFamily: s.font.serif,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {topic.forLabel}
          </button>
          <button
            type="button"
            onClick={() => pick('against')}
            style={{
              ...s.tintedFill('rgba(61, 184, 168, 0.7)'),
              flex: 1,
              minHeight: 72,
              fontSize: 17,
              padding: '14px 12px',
              borderRadius: 8,
              border: 'none',
              color: '#b8f5ec',
              fontFamily: s.font.serif,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {topic.againstLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
