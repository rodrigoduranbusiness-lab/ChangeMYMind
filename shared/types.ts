// Types shared between the web client and the Cloud Functions.

export type TopicId = 'immigration' | 'guns' | 'abortion' | 'economy'

/** Which end of the spectrum a position sits on. */
export type Side = 'left' | 'right'

export type SessionStatus = 'active' | 'won' | 'lost' | 'abandoned'

/** Why a session ended, for the results screen. */
export type SessionOutcomeReason =
  | 'persuaded'
  | 'timeout'
  | 'incivility'
  | 'abandoned'

export type Speaker = 'user' | 'ai'

export interface TranscriptEntry {
  speaker: Speaker
  text: string
  /** Epoch milliseconds, assigned server-side. */
  ts: number
}

/**
 * The judge's raw output. Field names are part of the prompt contract in
 * /prompts/judge.md — changing one means changing both.
 */
export interface JudgeScores {
  evidence_reasoning: number
  civility_tone: number
  acknowledges_tradeoffs: number
  addresses_ai_points: number
  persuasion: number
  gaming_detected: boolean
  rationale: string
}

export interface JudgeEval extends JudgeScores {
  /** Epoch milliseconds, assigned server-side. */
  ts: number
  /** Number of transcript entries the judge saw. */
  turnIndex: number
}

export interface DiagnosticAnswer {
  questionId: string
  /** 1 = strongly disagree … 5 = strongly agree. */
  value: number
}

export interface DiagnosticResult {
  answers: DiagnosticAnswer[]
  /** Per topic: -1 (left) … +1 (right). */
  topicLeans: Record<TopicId, number>
  /** Per topic: absolute value of the lean. */
  topicExtremity: Record<TopicId, number>
  /** 0 = closed to other views, 1 = very open. */
  openness: number
  assignedTopic: TopicId
  completedAt?: number
}

export interface UserProfile {
  phone: string | null
  createdAt: number
  diagnostic?: DiagnosticResult
}

/** A point on the circular spectrum. */
export interface SpectrumPoint {
  /** Degrees, 0 = east (fully right), 180 = west (fully left). */
  angle: number
  /** 0 = center / open-minded, 1 = edge / polarized. */
  radius: number
}

export interface SessionResults {
  polarizationScore: number
  angle: number
  radius: number
  diagnosticComponent: number
  conversationComponent: number
  takeaways: string[]
  topicPoints: Array<{ topic: TopicId; angle: number; radius: number }>
  finalScores: JudgeScores | null
}

export interface DebateSession {
  topic: TopicId
  /** The side the user argues, derived from their diagnostic lean. */
  userSide: Side
  /** The side the AI argues — always the opposite of userSide. */
  debaterSide: Side
  startedAt: number
  endedAt: number | null
  status: SessionStatus
  outcomeReason: SessionOutcomeReason | null
  /** Milliseconds the clock was paused for connection drops. */
  pausedMs: number
  transcript: TranscriptEntry[]
  judgeEvals: JudgeEval[]
  results?: SessionResults
}

// ---------------------------------------------------------------------------
// Callable function payloads
// ---------------------------------------------------------------------------

export interface StartSessionResponse {
  sessionId: string
  topic: TopicId
  userSide: Side
  debaterSide: Side
  /** Server clock, epoch ms. */
  startedAt: number
  /** Server-computed hard deadline, epoch ms. */
  deadline: number
}

export interface SubmitTurnRequest {
  sessionId: string
  /** Transcribed user speech for the turn that just ended. */
  userText: string
  /** Transcribed AI speech for the turn that just ended. */
  aiText: string
}

/**
 * Deliberately score-free: the client must not be able to render a meter or
 * hint at progress during the debate.
 */
export interface SubmitTurnResponse {
  outcome: 'continue' | 'won' | 'lost'
  reason: SessionOutcomeReason | null
  remainingMs: number
}

export interface FinalizeSessionRequest {
  sessionId: string
  /** Set when the client is reporting a clean timer expiry. */
  reason?: SessionOutcomeReason
}

export interface FinalizeSessionResponse {
  status: SessionStatus
  reason: SessionOutcomeReason | null
  results: SessionResults
}
