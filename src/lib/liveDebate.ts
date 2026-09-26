import debaterPromptRaw from '../../prompts/debater.md?raw'
import {
  detectInstantLossSpeech,
  INTERRUPTION_LEVEL_THRESHOLD,
  INTERRUPTION_OVERLAP_MS,
  USER_MAX_SPEECH_MS,
  YELLING_LEVEL_THRESHOLD,
  YELLING_SUSTAIN_MS,
} from '@shared/conduct'
import { renderOpponentPrompt } from '@shared/prompts'
import type { Side, TopicId, TranscriptEntry } from '@shared/types'
import { mintLiveAccess } from './api'
import { AudioPlayer, MicrophoneCapture, base64ToArrayBuffer, pcm16ToBase64 } from './audio'
import { VertexLiveSession, type VertexLiveServerContent } from './vertexLive'

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
  /** User spoke over the debater's audio (once per overlap). */
  onInterruption?: () => void
  /** User spoke continuously too long without yielding. */
  onLongTurn?: () => void
  /** While the user holds the floor (AI silent), elapsed time toward the 30s cap. */
  onUserTurnSpeech?: (progress: { elapsedMs: number; maxMs: number } | null) => void
  /** Sustained yelling over the mic threshold. */
  onYelling?: () => void
  /** Slur or directed abuse detected in user transcription. */
  onInstantSpeechViolation?: (reason: 'hate_speech' | 'incivility', text: string) => void
  /** The socket dropped. The caller decides whether to pause and reconnect. */
  onConnectionLost: () => void
}

export interface DebateControllerOptions {
  topic: TopicId
  debaterSide: Side
  handlers: DebateHandlers
}

/** Mic RMS above this counts as the user speaking. */
const VOICE_LEVEL_THRESHOLD = 0.035

/** How long after the last voiced frame we keep showing the user as speaking. */
const VOICE_HOLD_MS = 400

/** Brief pauses in speech do not reset the 30s turn clock or hide the countdown. */
const TURN_SILENCE_RESET_MS = 850

/** After this much silence, nudge Live API that the user's turn ended (hybrid VAD). */
const USER_END_OF_SPEECH_MS = 900

/** If the model still has not spoken after we ended the user's turn, nudge once. */
const AI_REPLY_NUDGE_MS = 2_200

/** After an interrupt, give the model a beat to resume audio. */
const INTERRUPTED_RESUME_MS = 1_400

/** Watchdog: no AI audio this long after we expect a reply → nudge again. */
const AI_STALL_MS = 4_500

const MIN_NUDGE_GAP_MS = 7_000
const MAX_NUDGES_BEFORE_TURN = 3

const SPEAKER_POLL_MS = 120

export class DebateController {
  private topic: TopicId
  private debaterSide: Side
  private handlers: DebateHandlers

  private session?: VertexLiveSession
  private mic?: MicrophoneCapture
  private player?: AudioPlayer

  private userBuffer = ''
  private aiBuffer = ''

  private aiPlaying = false
  private lastVoiceAt = 0
  private yellingSince: number | null = null
  private yellingReported = false
  private instantSpeechReported = false
  private overlapReported = false
  private overlapSince: number | null = null
  private userSpeechSince: number | null = null
  private longTurnReported = false
  private lastTurnSpeechNotifyAt = 0
  private userTurnEndSignaled = false
  private userSpokeSinceTurnEnd = false
  private aiReplyNudgeTimer?: number
  private interruptedResumeTimer?: number
  private opponentReplyDueAt: number | null = null
  private lastAiAudioAt = 0
  private nudgeCountThisCycle = 0
  private lastNudgeAt = 0
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
      const wasPlaying = this.aiPlaying
      this.aiPlaying = playing
      if (playing && !wasPlaying) {
        this.onOpponentAudio()
        this.overlapReported = false
        this.overlapSince = null
        this.userSpeechSince = null
        this.notifyUserTurnSpeech()
      }
    })
    await this.player.resume()

    await this.connect()

    this.mic = await MicrophoneCapture.start(({ pcm16, level }) => {
      if (level > VOICE_LEVEL_THRESHOLD) {
        this.lastVoiceAt = Date.now()
        if (!this.aiPlaying) {
          this.userSpokeSinceTurnEnd = true
        }
      }
      this.trackYelling(level)
      this.trackInterruption(level)
      this.trackLongTurn(level)
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
    this.clearAiReplyNudge()
    this.clearInterruptedResumeNudge()

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
    const access = await mintLiveAccess()
    const session = await VertexLiveSession.connect({
      accessToken: access.accessToken,
      wsUrl: access.wsUrl,
      model: access.model,
      systemInstruction: renderOpponentPrompt(debaterPromptRaw, this.topic, this.debaterSide),
    })
    this.session = session
    void this.runReceiveLoop(session)
  }

  private async runReceiveLoop(session: VertexLiveSession): Promise<void> {
    try {
      for await (const message of session.receive()) {
        // A stale loop from a previous session must not touch current state.
        if (this.session !== session) return
        if (!('serverContent' in message)) continue

        this.handleServerContent(message.serverContent as VertexLiveServerContent)
      }
    } catch {
      // Fall through to the disconnect handling below.
    }

    if (!this.stopping && this.session === session) {
      this.handlers.onConnectionLost()
    }
  }

  private handleServerContent(content: VertexLiveServerContent): void {
    if (content.interrupted) {
      this.player?.interrupt()
      this.scheduleInterruptedResumeNudge()
    }

    const audioPart = content.modelTurn?.parts?.find((part) =>
      part.inlineData?.mimeType.startsWith('audio/'),
    )
    if (audioPart?.inlineData) {
      this.onOpponentAudio()
      this.player?.enqueue(base64ToArrayBuffer(audioPart.inlineData.data))
    }

    // Transcriptions arrive in fragments and must be concatenated.
    if (content.inputTranscription?.text) {
      this.userBuffer += content.inputTranscription.text
      this.checkInstantSpeechViolation()
    }
    if (content.outputTranscription?.text) {
      this.aiBuffer += content.outputTranscription.text
    }

    if (content.turnComplete) {
      this.userTurnEndSignaled = false
      this.userSpokeSinceTurnEnd = false
      this.clearAiReplyNudge()
      this.clearInterruptedResumeNudge()
      this.flushTurn()
    }
  }

  private onOpponentAudio(): void {
    this.lastAiAudioAt = Date.now()
    this.opponentReplyDueAt = null
    this.nudgeCountThisCycle = 0
    this.clearAiReplyNudge()
    this.clearInterruptedResumeNudge()
  }

  private flushTurn(): void {
    const userText = this.userBuffer.trim()
    const aiText = this.aiBuffer.trim()
    this.userBuffer = ''
    this.aiBuffer = ''

    this.userSpeechSince = null
    this.longTurnReported = false
    this.notifyUserTurnSpeech()

    if (!userText && !aiText) return

    this.checkInstantSpeechViolation(userText)

    if (userText && !aiText) {
      this.markOpponentReplyDue()
      this.scheduleAiReplyNudge()
    } else if (aiText) {
      this.opponentReplyDueAt = null
      this.nudgeCountThisCycle = 0
    }

    this.handlers.onTurnComplete({ userText, aiText })
  }

  private markOpponentReplyDue(): void {
    this.opponentReplyDueAt = Date.now()
  }

  private async sendAudio(pcm16: Int16Array): Promise<void> {
    const session = this.session
    if (!session || session.isClosed) return

    try {
      await session.sendAudioRealtime({
        mimeType: 'audio/pcm;rate=16000',
        data: pcm16ToBase64(pcm16),
      })
    } catch {
      // The receive loop owns disconnect handling; dropping a frame is fine.
    }
  }

  private startSpeakerPolling(): void {
    this.speakerTimer = window.setInterval(() => {
      if (this.aiPlaying) {
        this.userTurnEndSignaled = false
        this.setSpeaker('ai')
      } else {
        this.overlapReported = false
        this.overlapSince = null
        const silentFor = Date.now() - this.lastVoiceAt
        if (silentFor < VOICE_HOLD_MS) {
          this.userTurnEndSignaled = false
          this.setSpeaker('user')
        } else {
          this.setSpeaker('idle')
          this.maybeSignalUserTurnEnd(silentFor)
          this.maybeRecoverStalledOpponent()
        }
      }
    }, SPEAKER_POLL_MS)
  }

  private maybeRecoverStalledOpponent(): void {
    if (
      this.stopping ||
      this.aiPlaying ||
      this.opponentReplyDueAt === null ||
      this.session?.isClosed
    ) {
      return
    }
    const waitingMs = Date.now() - this.opponentReplyDueAt
    const heardRecently = this.lastAiAudioAt >= this.opponentReplyDueAt
    if (waitingMs < AI_STALL_MS || heardRecently) {
      return
    }
    this.tryOpponentNudge(
      'The debate stalled. Speak your next line out loud now — answer what the user just said.',
    )
  }

  private maybeSignalUserTurnEnd(silentForMs: number): void {
    if (
      this.stopping ||
      this.userTurnEndSignaled ||
      silentForMs < USER_END_OF_SPEECH_MS ||
      !this.userSpokeSinceTurnEnd
    ) {
      return
    }
    this.userTurnEndSignaled = true
    this.userSpokeSinceTurnEnd = false
    this.markOpponentReplyDue()
    this.session?.sendUserTurnEnd()
    this.scheduleAiReplyNudge()
  }

  private scheduleAiReplyNudge(): void {
    this.clearAiReplyNudge()
    this.aiReplyNudgeTimer = window.setTimeout(() => {
      this.aiReplyNudgeTimer = undefined
      this.tryOpponentNudge(
        'The user just finished speaking. Reply out loud with a direct response to what they said.',
      )
    }, AI_REPLY_NUDGE_MS)
  }

  private scheduleInterruptedResumeNudge(): void {
    this.clearInterruptedResumeNudge()
    this.markOpponentReplyDue()
    this.interruptedResumeTimer = window.setTimeout(() => {
      this.interruptedResumeTimer = undefined
      this.tryOpponentNudge(
        'You were cut off. Finish your point in one or two spoken sentences, then let the user respond.',
      )
    }, INTERRUPTED_RESUME_MS)
  }

  private tryOpponentNudge(spokenInstruction: string): void {
    if (this.stopping || this.aiPlaying || this.session?.isClosed) {
      return
    }
    const now = Date.now()
    if (now - this.lastNudgeAt < MIN_NUDGE_GAP_MS) {
      return
    }
    if (this.nudgeCountThisCycle >= MAX_NUDGES_BEFORE_TURN) {
      return
    }
    this.lastNudgeAt = now
    this.nudgeCountThisCycle += 1
    this.session?.sendUserTurnEnd()
    void this.session?.send(spokenInstruction, true)
  }

  private clearAiReplyNudge(): void {
    if (this.aiReplyNudgeTimer !== undefined) {
      window.clearTimeout(this.aiReplyNudgeTimer)
      this.aiReplyNudgeTimer = undefined
    }
  }

  private clearInterruptedResumeNudge(): void {
    if (this.interruptedResumeTimer !== undefined) {
      window.clearTimeout(this.interruptedResumeTimer)
      this.interruptedResumeTimer = undefined
    }
  }

  private notifyUserTurnSpeech(force = false): void {
    const cb = this.handlers.onUserTurnSpeech
    if (!cb) {
      return
    }
    if (this.aiPlaying || this.longTurnReported || this.userSpeechSince === null) {
      cb(null)
      this.lastTurnSpeechNotifyAt = 0
      return
    }
    const now = Date.now()
    if (!force && now - this.lastTurnSpeechNotifyAt < 450) {
      return
    }
    this.lastTurnSpeechNotifyAt = now
    cb({
      elapsedMs: now - this.userSpeechSince,
      maxMs: USER_MAX_SPEECH_MS,
    })
  }

  private trackLongTurn(_level: number): void {
    if (this.aiPlaying) {
      this.userSpeechSince = null
      this.notifyUserTurnSpeech(true)
      return
    }

    const now = Date.now()
    const silentFor = now - this.lastVoiceAt
    if (silentFor > TURN_SILENCE_RESET_MS) {
      this.userSpeechSince = null
      this.notifyUserTurnSpeech(true)
      return
    }

    if (this.longTurnReported) {
      this.notifyUserTurnSpeech(true)
      return
    }

    if (this.userSpeechSince === null) {
      this.userSpeechSince = this.lastVoiceAt
    } else if (now - this.userSpeechSince >= USER_MAX_SPEECH_MS) {
      this.longTurnReported = true
      this.userSpeechSince = null
      this.handlers.onLongTurn?.()
      this.notifyUserTurnSpeech(true)
      return
    }
    this.notifyUserTurnSpeech()
  }

  private trackInterruption(level: number): void {
    if (!this.aiPlaying) {
      this.overlapSince = null
      return
    }
    if (level <= INTERRUPTION_LEVEL_THRESHOLD) {
      this.overlapSince = null
      return
    }
    if (this.overlapReported) {
      return
    }
    const now = Date.now()
    if (this.overlapSince === null) {
      this.overlapSince = now
      return
    }
    if (now - this.overlapSince >= INTERRUPTION_OVERLAP_MS) {
      this.overlapReported = true
      this.overlapSince = null
      this.handlers.onInterruption?.()
    }
  }

  private checkInstantSpeechViolation(text?: string): void {
    if (this.instantSpeechReported || this.stopping) {
      return
    }
    const sample = (text ?? this.userBuffer).trim()
    if (sample.length < 3) {
      return
    }
    const reason = detectInstantLossSpeech(sample)
    if (!reason) {
      return
    }
    this.instantSpeechReported = true
    this.handlers.onInstantSpeechViolation?.(reason, sample)
  }

  private trackYelling(level: number): void {
    if (this.yellingReported) {
      return
    }
    if (level >= YELLING_LEVEL_THRESHOLD) {
      const now = Date.now()
      if (this.yellingSince === null) {
        this.yellingSince = now
      } else if (now - this.yellingSince >= YELLING_SUSTAIN_MS) {
        this.yellingReported = true
        this.handlers.onYelling?.()
      }
    } else {
      this.yellingSince = null
    }
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
