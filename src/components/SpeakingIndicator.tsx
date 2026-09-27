import HueyAvatar from './HueyAvatar'
import type { SpeakerState } from '../lib/liveDebate'

/**
 * Live presence cue for Huey during voice debates.
 */
export default function SpeakingIndicator({ speaker }: { speaker: SpeakerState }) {
  const talking = speaker === 'ai'

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={talking ? 'Huey is speaking' : 'Huey is listening'}
      style={{
        marginLeft: 'auto',
        marginRight: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <HueyAvatar size="lg" active={talking} variant="mono" label="Huey" />
    </div>
  )
}
