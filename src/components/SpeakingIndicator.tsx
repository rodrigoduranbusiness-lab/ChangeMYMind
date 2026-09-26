import type { SpeakerState } from '../lib/liveDebate'
import * as s from '../theme'

/**
 * The only live feedback the user gets, alongside the clock: who is talking.
 * No score, no meter, no hint about how the debate is going.
 */
export default function SpeakingIndicator({ speaker }: { speaker: SpeakerState }) {
  return (
    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
      <Side label="You" active={speaker === 'user'} accent={s.color.accent} />
      <Side label="The AI" active={speaker === 'ai'} accent={s.color.left} />
    </div>
  )
}

function Side({ label, active, accent }: { label: string; active: boolean; accent: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '22px 16px',
        background: active ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
        border: `1px solid ${active ? accent : s.color.border}`,
        borderRadius: 14,
        transition: 'border-color 150ms ease, background 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 28 }}>
        {[0, 1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            style={{
              width: 4,
              height: active ? '100%' : 4,
              borderRadius: 999,
              background: active ? accent : s.color.borderStrong,
              transformOrigin: 'bottom',
              animation: active ? `cg-bar 900ms ease-in-out ${bar * 110}ms infinite` : 'none',
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: active ? s.color.text : s.color.textFaint,
        }}
      >
        {active ? `${label} — speaking` : label}
      </div>
    </div>
  )
}
