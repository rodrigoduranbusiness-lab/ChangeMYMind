import { markUntrustedUserSpeech } from '../shared/promptGuard'
import type { TranscriptEntry } from '../shared/types'

export function formatTranscript(transcript: TranscriptEntry[]): string {
  if (!transcript.length) {
    return '(no speech yet)'
  }
  return transcript
    .map((entry, index) => {
      const label = entry.speaker === 'user' ? 'USER' : 'AI OPPONENT'
      const body =
        entry.speaker === 'user'
          ? markUntrustedUserSpeech(entry.text)
          : entry.text.trim()
      return `[${index + 1}] ${label}: ${body}`
    })
    .join('\n')
}
