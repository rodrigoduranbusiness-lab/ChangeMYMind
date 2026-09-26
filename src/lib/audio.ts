/**
 * Microphone capture and playback for the Live API.
 *
 * The Firebase AI Logic SDK ships a `startAudioConversation` helper that does
 * this, but it takes sole ownership of `session.receive()` and drops the
 * transcription messages. We need the transcript, so we run our own audio
 * pipeline and read the message stream ourselves.
 *
 * Wire format required by the server: 16 kHz, 16-bit, little-endian, mono PCM
 * inbound; 24 kHz, 16-bit mono PCM outbound.
 */

export const SERVER_INPUT_SAMPLE_RATE = 16_000
export const SERVER_OUTPUT_SAMPLE_RATE = 24_000

const WORKLET_NAME = 'common-ground-mic'

/**
 * Downsamples the mic to 16 kHz and converts to Int16. Runs on the audio
 * thread, so it is kept deliberately cheap.
 */
const MIC_WORKLET_SOURCE = `
class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = options.processorOptions.targetSampleRate;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) {
      return true;
    }

    const samples = input[0];
    const outLength = Math.round(samples.length * this.targetSampleRate / sampleRate);
    const pcm16 = new Int16Array(outLength);
    const ratio = samples.length / outLength;

    let sumSquares = 0;
    for (let i = 0; i < outLength; i++) {
      const sample = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)]));
      sumSquares += sample * sample;
      pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }

    this.port.postMessage(
      { pcm16, level: Math.sqrt(sumSquares / (outLength || 1)) },
      [pcm16.buffer]
    );
    return true;
  }
}

registerProcessor('${WORKLET_NAME}', MicProcessor);
`

export interface MicChunk {
  pcm16: Int16Array
  /** RMS amplitude 0…1, used for the "who is speaking" indicator. */
  level: number
}

export class MicrophoneCapture {
  private context: AudioContext
  private stream: MediaStream
  private source: MediaStreamAudioSourceNode
  private worklet: AudioWorkletNode
  private stopped = false

  private constructor(
    context: AudioContext,
    stream: MediaStream,
    source: MediaStreamAudioSourceNode,
    worklet: AudioWorkletNode,
  ) {
    this.context = context
    this.stream = stream
    this.source = source
    this.worklet = worklet
  }

  /**
   * Must be called from a user gesture, and will reject with a DOMException
   * (`NotAllowedError`, `NotFoundError`) if the mic is unavailable.
   */
  static async start(onChunk: (chunk: MicChunk) => void): Promise<MicrophoneCapture> {
    if (typeof AudioWorkletNode === 'undefined' || !navigator.mediaDevices) {
      throw new Error('This browser does not support the audio APIs the debate needs.')
    }

    const context = new AudioContext()
    if (context.state === 'suspended') {
      await context.resume()
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (error) {
      await context.close()
      throw error
    }

    const blobUrl = URL.createObjectURL(
      new Blob([MIC_WORKLET_SOURCE], { type: 'application/javascript' }),
    )
    try {
      await context.audioWorklet.addModule(blobUrl)
    } finally {
      URL.revokeObjectURL(blobUrl)
    }

    const source = context.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(context, WORKLET_NAME, {
      processorOptions: { targetSampleRate: SERVER_INPUT_SAMPLE_RATE },
    })
    source.connect(worklet)

    const capture = new MicrophoneCapture(context, stream, source, worklet)
    worklet.port.onmessage = (event: MessageEvent<MicChunk>) => {
      if (!capture.stopped) {
        onChunk(event.data)
      }
    }
    return capture
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true

    this.worklet.port.onmessage = null
    this.worklet.disconnect()
    this.source.disconnect()
    this.stream.getTracks().forEach((track) => track.stop())
    if (this.context.state !== 'closed') {
      await this.context.close()
    }
  }
}

/**
 * Gapless playback of the model's audio, scheduled on the Web Audio clock so
 * consecutive chunks do not click. Supports hard interruption, which the Live
 * API needs when the user talks over the model.
 */
export class AudioPlayer {
  private context: AudioContext
  private scheduled = new Set<AudioBufferSourceNode>()
  private nextStartTime = 0
  private onPlayingChange: (playing: boolean) => void
  private closed = false

  constructor(onPlayingChange: (playing: boolean) => void) {
    this.onPlayingChange = onPlayingChange
    // Matching the context rate to the stream rate avoids a resample pass.
    try {
      this.context = new AudioContext({ sampleRate: SERVER_OUTPUT_SAMPLE_RATE })
    } catch {
      this.context = new AudioContext()
    }
  }

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  get isPlaying(): boolean {
    return this.scheduled.size > 0
  }

  enqueue(pcmBytes: ArrayBuffer): void {
    if (this.closed || pcmBytes.byteLength === 0) return

    const pcm16 = new Int16Array(pcmBytes)
    const buffer = this.context.createBuffer(1, pcm16.length, SERVER_OUTPUT_SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm16.length; i++) {
      channel[i] = pcm16[i] / 32768
    }

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)

    const startAt = Math.max(this.context.currentTime, this.nextStartTime)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration

    const wasPlaying = this.isPlaying
    this.scheduled.add(source)
    if (!wasPlaying) {
      this.onPlayingChange(true)
    }

    source.onended = () => {
      this.scheduled.delete(source)
      if (!this.isPlaying) {
        this.onPlayingChange(false)
      }
    }
  }

  /** Drops everything queued — used when the model is interrupted or cut off. */
  interrupt(): void {
    for (const source of this.scheduled) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // Already finished; nothing to stop.
      }
    }
    this.scheduled.clear()
    this.nextStartTime = 0
    this.onPlayingChange(false)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.interrupt()
    if (this.context.state !== 'closed') {
      await this.context.close()
    }
  }
}

export function pcm16ToBase64(pcm16: Int16Array): string {
  const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
  let binary = ''
  // Chunked to keep the argument list off the call stack limit.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
