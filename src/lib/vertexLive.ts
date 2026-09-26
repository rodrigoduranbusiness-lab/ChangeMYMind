import { LIVE_VOICE } from '../firebase'

export interface VertexLiveServerContent {
  interrupted?: boolean
  turnComplete?: boolean
  modelTurn?: {
    parts?: Array<{
      inlineData?: { mimeType: string; data: string }
      text?: string
    }>
  }
  inputTranscription?: { text?: string }
  outputTranscription?: { text?: string }
}

export interface VertexLiveConnectOptions {
  accessToken: string
  wsUrl: string
  model: string
  systemInstruction: string
  voiceName?: string
}

/**
 * Direct Vertex Live WebSocket session. Used instead of Firebase AI Logic
 * because browser WebSockets cannot send App Check headers, and Firebase's
 * Live gateway rejects the handshake without them.
 */
export class VertexLiveSession {
  private ws: WebSocket
  private closed = false
  private receiveQueue: Array<Record<string, unknown>> = []
  private receiveWaiters: Array<(value: Record<string, unknown> | null) => void> = []

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

  static async connect(options: VertexLiveConnectOptions): Promise<VertexLiveSession> {
    const url = `${options.wsUrl}?access_token=${encodeURIComponent(options.accessToken)}`
    const ws = await openSocket(url)

    const setup = {
      setup: {
        model: options.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voiceName ?? LIVE_VOICE },
            },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        // Loud rooms otherwise barge into the AI mid-sentence. Low start
        // sensitivity + longer prefix padding ignore ambient noise; users can
        // still interrupt by speaking clearly over the model.
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            prefixPaddingMs: 400,
            silenceDurationMs: 500,
          },
        },
        systemInstruction: {
          parts: [{ text: options.systemInstruction }],
        },
      },
    }

    ws.send(JSON.stringify(setup))

    const first = await waitForMessage(ws, 12_000)
    if (!first || typeof first !== 'object' || !('setupComplete' in first)) {
      ws.close(1011, 'Handshake failure')
      const detail =
        first && typeof first === 'object'
          ? JSON.stringify(first).slice(0, 240)
          : 'no response'
      throw new Error(`Live handshake failed (no setupComplete): ${detail}`)
    }

    return new VertexLiveSession(ws)
  }

  async send(text: string, turnComplete = true): Promise<void> {
    if (this.isClosed) return
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete,
        },
      }),
    )
  }

  async sendAudioRealtime(blob: { mimeType: string; data: string }): Promise<void> {
    if (this.isClosed) return
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: blob,
        },
      }),
    )
  }

  /** Hybrid VAD: tell the server the user finished speaking so it can respond. */
  sendUserTurnEnd(): void {
    if (this.isClosed) return
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audioStreamEnd: true,
        },
      }),
    )
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

  private async onMessage(data: unknown): Promise<void> {
    try {
      const text =
        typeof data === 'string'
          ? data
          : data instanceof Blob
            ? await data.text()
            : ''
      if (!text) return
      const parsed = JSON.parse(text) as Record<string, unknown>
      const waiter = this.receiveWaiters.shift()
      if (waiter) waiter(parsed)
      else this.receiveQueue.push(parsed)
    } catch {
      // Drop malformed frames.
    }
  }

  private flushWaiters(value: Record<string, unknown> | null): void {
    while (this.receiveWaiters.length) {
      this.receiveWaiters.shift()?.(value)
    }
  }
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(ws), { once: true })
    ws.addEventListener(
      'error',
      () => reject(new Error('Live WebSocket failed to open.')),
      { once: true },
    )
  })
}

function waitForMessage(ws: WebSocket, timeoutMs: number): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(null)
    }, timeoutMs)

    const onMessage = async (event: MessageEvent) => {
      cleanup()
      try {
        const text =
          typeof event.data === 'string'
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : ''
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : null)
      } catch {
        resolve(null)
      }
    }

    const onClose = () => {
      cleanup()
      resolve(null)
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      ws.removeEventListener('message', onMessage)
      ws.removeEventListener('close', onClose)
    }

    ws.addEventListener('message', onMessage)
    ws.addEventListener('close', onClose)
  })
}
