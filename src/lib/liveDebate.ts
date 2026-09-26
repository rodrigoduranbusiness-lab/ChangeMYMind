import { ResponseModality, getLiveGenerativeModel } from 'firebase/ai'
import type { LiveServerContent, LiveSession } from 'firebase/ai'

import debaterPromptRaw from '../../prompts/debater.md?raw'
import { renderPrompt } from '@shared/prompts'
import type { Side, TopicId, TranscriptEntry } from '@shared/types'
import { LIVE_MODEL, LIVE_VOICE, ai } from '../firebase'
import { AudioPlayer, MicrophoneCapture, base64ToArrayBuffer, pcm16ToBase64 } from './audio'

/** Who the UI should show as talking. This is the only live signal the user gets. */
export type SpeakerState = 'idle' | 'user' | 'ai'

export interface CompletedTurn {
  userText: string
  aiText: string
}

export interface DebateHandlers {
  onSpeakerChange: (speaker: SpeakerState) => void
  /** Fires when the model finishes a turn, with both sides' transcripts. */
  onTurnComplete: (turn: CompletedTurn) => void
  /** The socket dropped. The caller decides whether to pause and reconnect. */
  onConnectionLost: () => void
}

export interface DebateControllerOptions {
  topic: TopicId
  debaterSide: Side
  handlers: DebateHandlers
}

/** Mic RMS above this counts as the user speaking. */
const VOICE_LEVEL_THRESHOLD = 0.02

/** How long after the last voiced frame we keep showing the user as speaking. */
const VOICE_HOLD_MS = 400

const SPEAKER_POLL_MS = 120

export class DebateController {
  private topic: TopicId
  private debaterSide: Side
  private handlers: DebateHandlers

  private session?: LiveSession
  private mic?: MicrophoneCapture
  private player?: AudioPlayer

  private userBuffer = ''
  private aiBuffer = ''

  private aiPlaying = false
  private lastVoiceAt = 0
  private speaker: SpeakerState = 'idle'
  private speakerTimer?: number

  private stopping = false

  constructor(options: DebateControllerOptions) {
    this.topic = options.topic
    this.debaterSide = options.debaterSide
    this.handlers = options.handlers
  }

  /**
   * Opens the Live session and starts capturing audio. Rejects with a
   * DOMException if the user denies the microphone, which the caller surfaces
   * as its own screen.
   */
  async start(): Promise<void> {
    this.player = new AudioPlayer((playing) => {
      this.aiPlaying = playing
    })
    await this.player.resume()

    await this.connect()

    this.mic = await MicrophoneCapture.start(({ pcm16, level }) => {
      if (level > VOICE_LEVEL_THRESHOLD) {
        this.lastVoiceAt = Date.now()
      }
      void this.sendAudio(pcm16)
    })

    this.startSpeakerPolling()

    // The debater opens the debate, so it needs a nudge to speak first.
    await this.session?.send(
      'The user is connected and listening. Give your opening statement now.',
      true,
    )
  }

  /**
   * Rebuilds the session after a dropped connection and replays the transcript
   * so the debater keeps its position and continuity.
   */
  async reconnect(transcript: TranscriptEntry[]): Promise<void> {
    await this.closeSession()
    this.userBuffer = ''
    this.aiBuffer = ''
    this.player?.interrupt()

    await this.connect()

    const history = transcript
      .slice(-12)
      .map((entry) => `${entry.speaker === 'user' ? 'Them' : 'You'}: ${entry.text}`)
      .join('\n')

    await this.session?.send(
      [
        'The connection dropped for a moment and has now been restored.',
        'For your reference, this is the debate so far:',
        history || '(nothing yet)',
        'Pick the debate back up with one short line, then continue making your case.',
      ].join('\n\n'),
      true,
    )
  }

  async stop(): Promise<void> {
    this.stopping = true

    if (this.speakerTimer !== undefined) {
      window.clearInterval(this.speakerTimer)
      this.speakerTimer = undefined
    }

    await this.mic?.stop()
    this.mic = undefined

    await this.player?.close()
    this.player = undefined

    await this.closeSession()
    this.setSpeaker('idle')
  }

  /** Cuts the debater off mid-sentence, for an immediate win/lose transition. */
  cutAudio(): void {
    this.player?.interrupt()
    this.aiPlaying = false
    this.setSpeaker('idle')
  }

  private async connect(): Promise<void> {
    const liveModel = getLiveGenerativeModel(ai, {
      model: LIVE_MODEL,
      generationConfig: {
        responseModalities: [ResponseModality.AUDIO],
        // Both directions are transcribed so the judge and the results screen
        // see the full conversation.
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE } },
        },
        temperature: 0.8,
      },
      systemInstruction: renderPrompt(debaterPromptRaw, this.topic, this.debaterSide),
    })

    this.session = await liveModel.connect()
    void this.runReceiveLoop(this.session)
  }

  private async runReceiveLoop(session: LiveSession): Promise<void> {
    try {
      for await (const message of session.receive()) {
        // A stale loop from a previous session must not touch current state.
        if (this.session !== session) return
        if (message.type !== 'serverContent') continue

        this.handleServerContent(message as LiveServerContent)
      }
    } catch {
      // Fall through to the disconnect handling below.
    }

    if (!this.stopping && this.session === session) {
      this.handlers.onConnectionLost()
    }
  }

  private handleServerContent(content: LiveServerContent): void {
    if (content.interrupted) {
      this.player?.interrupt()
    }

    const audioPart = content.modelTurn?.parts?.find((part) =>
      part.inlineData?.mimeType.startsWith('audio/'),
    )
    if (audioPart?.inlineData) {
      this.player?.enqueue(base64ToArrayBuffer(audioPart.inlineData.data))
    }

    // Transcriptions arrive in fragments and must be concatenated.
    if (content.inputTranscription?.text) {
      this.userBuffer += content.inputTranscription.text
    }
    if (content.outputTranscription?.text) {
      this.aiBuffer += content.outputTranscription.text
    }

    if (content.turnComplete) {
      this.flushTurn()
    }
  }

  private flushTurn(): void {
    const userText = this.userBuffer.trim()
    const aiText = this.aiBuffer.trim()
    this.userBuffer = ''
    this.aiBuffer = ''

    if (!userText && !aiText) return
    this.handlers.onTurnComplete({ userText, aiText })
  }

  private async sendAudio(pcm16: Int16Array): Promise<void> {
    const session = this.session
    if (!session || session.isClosed) return

    try {
      await session.sendAudioRealtime({
        mimeType: 'audio/pcm',
        data: pcm16ToBase64(pcm16),
      })
    } catch {
      // The receive loop owns disconnect handling; dropping a frame is fine.
    }
  }

  private startSpeakerPolling(): void {
    this.speakerTimer = window.setInterval(() => {
      if (this.aiPlaying) {
        this.setSpeaker('ai')
      } else if (Date.now() - this.lastVoiceAt < VOICE_HOLD_MS) {
        this.setSpeaker('user')
      } else {
        this.setSpeaker('idle')
      }
    }, SPEAKER_POLL_MS)
  }

  private setSpeaker(speaker: SpeakerState): void {
    if (this.speaker === speaker) return
    this.speaker = speaker
    this.handlers.onSpeakerChange(speaker)
  }

  private async closeSession(): Promise<void> {
    const session = this.session
    this.session = undefined
    if (!session || session.isClosed) return
    try {
      await session.close()
    } catch {
      // Already gone.
    }
  }
}
