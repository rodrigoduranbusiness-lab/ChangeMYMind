import type { VertexLiveServerContent } from './vertexLive'

export interface GrokLiveConnectOptions {
  accessToken: string
  wsUrl: string
  systemInstruction: string
  voiceName?: string
}

/**
 * xAI Speech-to-Speech WebSocket. Emits the same `serverContent` shape as
 * {@link VertexLiveSession} so {@link DebateController} stays provider-agnostic.
 */
export class GrokLiveSession {
  private ws: WebSocket
  private closed = false
  private receiveQueue: Array<Record<string, unknown>> = []
  private receiveWaiters: Array<(value: Record<string, unknown> | null) => void> = []
  private lastUserTranscript = ''

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.addEventListener('message', (event) => {
      void this.onMessage(event.data)
    })
    this.ws.addEventListener('close', () => {
      this.closed = true
      this.flushWaiters(null)
    })
    this.ws.addEventListener('error', () => {
      this.closed = true
      this.flushWaiters(null)
    })
  }

  get isClosed(): boolean {
    return this.closed || this.ws.readyState === WebSocket.CLOSED
  }

  static async connect(options: GrokLiveConnectOptions): Promise<GrokLiveSession> {
    const protocols = [`xai-client-secret.${options.accessToken}`]
    const ws = await openSocket(options.wsUrl, protocols)

    const session = new GrokLiveSession(ws)
    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: options.voiceName ?? 'eve',
          instructions: options.systemInstruction,
          turn_detection: { type: 'server_vad' },
          audio: {
            input: { format: { type: 'audio/pcm', rate: 16000 } },
            output: { format: { type: 'audio/pcm', rate: 24000 } },
          },
          input: {
            transcription: { model: 'grok-transcribe' },
          },
        },
      }),
    )

    return session
  }

  async send(text: string, _turnComplete = true): Promise<void> {
    if (this.isClosed) return
    this.ws.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      }),
    )
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  async sendAudioRealtime(blob: { mimeType: string; data: string }): Promise<void> {
    if (this.isClosed) return
    this.ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: blob.data,
      }),
    )
  }

  sendUserTurnEnd(): void {
    if (this.isClosed) return
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    this.ws.send(JSON.stringify({ type: 'response.create' }))
  }

  async *receive(): AsyncGenerator<Record<string, unknown>> {
    while (!this.isClosed) {
      if (this.receiveQueue.length > 0) {
        yield this.receiveQueue.shift()!
        continue
      }
      const next = await new Promise<Record<string, unknown> | null>((resolve) => {
        this.receiveWaiters.push(resolve)
      })
      if (next === null) return
      yield next
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.flushWaiters(null)
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close()
    }
  }

  private pushServerContent(content: VertexLiveServerContent): void {
    const frame = { serverContent: content }
    const waiter = this.receiveWaiters.shift()
    if (waiter) waiter(frame)
    else this.receiveQueue.push(frame)
  }

  private onMessage(data: unknown): void {
    void this.parseMessage(data)
  }

  private async parseMessage(data: unknown): Promise<void> {
    try {
      const text =
        typeof data === 'string' ? data : data instanceof Blob ? await data.text() : ''
      if (!text) return
      const event = JSON.parse(text) as { type?: string; delta?: string; transcript?: string }
      const type = event.type ?? ''

      if (type === 'response.output_audio.delta' && event.delta) {
        this.pushServerContent({
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm', data: event.delta } }],
          },
        })
        return
      }

      if (
        type === 'conversation.item.input_audio_transcription.updated' ||
        type === 'conversation.item.input_audio_transcription.completed'
      ) {
        const cumulative = typeof event.transcript === 'string' ? event.transcript : ''
        const delta = cumulative.slice(this.lastUserTranscript.length)
        this.lastUserTranscript = cumulative
        if (delta) {
          this.pushServerContent({ inputTranscription: { text: delta } })
        }
        return
      }

      if (
        type === 'response.output_audio_transcript.delta' ||
        type === 'response.audio_transcript.delta'
      ) {
        const piece = typeof event.delta === 'string' ? event.delta : ''
        if (piece) {
          this.pushServerContent({ outputTranscription: { text: piece } })
        }
        return
      }

      if (type === 'response.done') {
        this.pushServerContent({ turnComplete: true })
        this.lastUserTranscript = ''
        return
      }

      if (type === 'input_audio_buffer.speech_started') {
        this.pushServerContent({ interrupted: false })
      }
    } catch {
      // Ignore malformed frames.
    }
  }

  private flushWaiters(value: Record<string, unknown> | null): void {
    while (this.receiveWaiters.length) {
      this.receiveWaiters.shift()?.(value)
    }
  }
}

function openSocket(url: string, protocols: string[]): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, protocols)
    ws.addEventListener('open', () => resolve(ws), { once: true })
    ws.addEventListener(
      'error',
      () => reject(new Error('Grok Live WebSocket failed to open.')),
      { once: true },
    )
  })
}
