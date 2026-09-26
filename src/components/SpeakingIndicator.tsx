import type { SpeakerState } from '../lib/liveDebate'
import * as s from '../theme'

const DOT_COUNT = 16
const RADIUS = 72
const DOT_SIZE = 7

/**
 * Circle of dots — still while the agent waits, slowly spinning and breathing
 * while it talks. The only live presence cue beside the clock.
 */
export default function SpeakingIndicator({ speaker }: { speaker: SpeakerState }) {
  const talking = speaker === 'ai'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={talking ? 'The AI is speaking' : 'Waiting'}
      style={{
        width: RADIUS * 2 + DOT_SIZE * 2,
        height: RADIUS * 2 + DOT_SIZE * 2,
        marginLeft: 'auto',
        marginRight: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: talking ? 'cg-orb-breathe 2.8s ease-in-out infinite' : undefined,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: RADIUS * 2,
          height: RADIUS * 2,
          animation: talking ? 'cg-orb-spin 14s linear infinite' : undefined,
        }}
      >
        {Array.from({ length: DOT_COUNT }, (_, index) => {
          const angle = (index / DOT_COUNT) * 360
          return (
            <span
              key={index}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: DOT_SIZE,
                height: DOT_SIZE,
                marginLeft: -DOT_SIZE / 2,
                marginTop: -DOT_SIZE / 2,
                borderRadius: '50%',
                background: s.color.text,
                opacity: talking ? 0.95 : 0.55,
                transform: `rotate(${angle}deg) translateY(-${RADIUS}px)`,
                transition: 'opacity 400ms ease',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
