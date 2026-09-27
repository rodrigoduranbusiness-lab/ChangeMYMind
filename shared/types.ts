// Types shared between the web client and the Cloud Functions.

export type TopicId = 'immigration' | 'guns' | 'abortion' | 'economy' | 'ai'

/** Which end of the spectrum a position sits on. */
export type Side = 'left' | 'right'

export type SessionStatus = 'active' | 'passed' | 'needs_work' | 'lost' | 'abandoned'

/** @deprecated Use `passed`. Kept so older Firestore docs still type-check. */
export type LegacySessionStatus = SessionStatus | 'won'

/** Why a session ended, for the results screen. */
export type SessionOutcomeReason =
  | 'passed'
  | 'needs_work'
  | 'timeout'
  | 'incivility'
  | 'hate_speech'
  | 'yelling'
  | 'conduct_cap'
  | 'interruptions'
  | 'argument_quality'
  | 'abandoned'
  /** @deprecated Early persuasion wins removed. */
  | 'persuaded'

export type Speaker = 'user' | 'ai'

export interface TranscriptEntry {
  speaker: Speaker
  text: string
  /** Epoch milliseconds, assigned server-side. */
  ts: number
}

export type EventLogSource = 'event_log' | 'judge_detected'

export type EventLogType =
  | 'interruption'
  | 'long_turn'
  | 'yelling'
  | 'insult'
  | 'dismissiveness'
  | 'dead_air'
  | 'hate_speech'
  | 'toxicity'
  | 'gaming_attempt'

/** Structured conduct flags from client classifiers + server heuristics. */
export interface EventLogEntry {
  ts: number
  /** User exchange index when the event occurred (1-based). */
  turn: number
  type: EventLogType
  source: EventLogSource
  detail?: string
}

export type FactCheckStatus = 'verified' | 'contradicted' | 'unverified'

export interface JudgeFactCheck {
  turn: number
  claim: string
  status: FactCheckStatus
  fact_id: string | null
}

export interface JudgePenaltyEvent {
  turn: number
  type: 'interruption' | 'yelling' | 'insult' | 'dismissiveness'
  source: EventLogSource
}

/** End-of-session judge output (separate model call from the Live opponent). */
export interface JudgeSessionVerdict {
  session_terminate: boolean
  termination_reason: string | null
  respect_score: number
  argument_quality_score: number
  penalty_events: JudgePenaltyEvent[]
  fact_checks: JudgeFactCheck[]
  result: 'pass' | 'needs_work'
  feedback_summary: string
  topics_for_resource_screen: string[]
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
  /** Judge: user dodged the debater's last substantive point. */
  ignored_last_point?: boolean
  /** Judge: same claim repeated without new support. */
  repeated_without_evidence?: boolean
  /** Judge: direct question left unanswered (incl. long dead air). */
  failed_direct_answer?: boolean
  /** Judge: slur or severe dehumanization — instant loss when true. */
  severe_hate_speech?: boolean
  /** Judge: name-calling / mild toxicity tier — respect penalty. */
  mild_insult?: boolean
  /** Judge: user cited a specific fact not in the topic fact bank. */
  unverified_fact_citation?: boolean
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
  /** Optional display name the user sets in settings. */
  displayName?: string | null
  /** Firestore timestamp in the database; epoch ms when returned locally right after signup. */
  createdAt: number
  diagnostic?: DiagnosticResult
  /** Total debates started (server-maintained). */
  debateRoundCount?: number
}

/** Index row for each debate round (mirrors `sessions/{sessionId}`). */
export interface DebateRoundRecord {
  sessionId: string
  roundNumber: number
  topic: TopicId
  startedAt: number
  endedAt: number | null
  status: SessionStatus
  outcomeReason: SessionOutcomeReason | null
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
  /** @deprecated Legacy per-turn rubric; new sessions use `judgeVerdict`. */
  finalScores: JudgeScores | null
  judgeVerdict?: JudgeSessionVerdict | null
}

export interface DebateSession {
  /** 1-based index of this debate for the user account. */
  roundNumber?: number
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
  /** Completed user↔AI exchanges (each judged turn submission). */
  exchangeCount?: number
  eventLog?: EventLogEntry[]
  judgeVerdict?: JudgeSessionVerdict | null
  /** @deprecated Per-turn judge; mid-debate scoring removed. */
  judgeEvals: JudgeEval[]
  /** Each interruption, mild insult, or yelling report increments this. */
  conductEvents?: number
  /** −1 respect per event (and per mild_insult from judge). */
  conductPenaltyPoints?: number
  results?: SessionResults
  /** Pass unlocks harder topic + resources (future). */
  debateVerdict?: 'pass' | 'needs_work'
}

// ---------------------------------------------------------------------------
// Callable function payloads
// ---------------------------------------------------------------------------

export interface StartSessionResponse {
  sessionId: string
  roundNumber: number
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
  outcome: 'continue' | 'passed' | 'needs_work' | 'lost'
  reason: SessionOutcomeReason | null
  remainingMs: number
}

export interface ReportConductRequest {
  sessionId: string
  kind: 'interruption' | 'long_turn' | 'yelling' | 'mild_insult'
  /** Current exchange index (1-based), from the client. */
  turn?: number
}

export interface ReportConductResponse {
  outcome: 'continue' | 'passed' | 'needs_work' | 'lost'
  reason: SessionOutcomeReason | null
  conductEvents: number
  interruptionCount: number
  interruptionsLimit: number
}

export interface FinalizeSessionRequest {
  sessionId: string
  /** Set when the client is reporting a clean timer expiry. */
  reason?: SessionOutcomeReason
  /** Client-side transcript buffer; merged server-side before judging. */
  transcript?: TranscriptEntry[]
}

export interface SyncTranscriptRequest {
  sessionId: string
  entries: TranscriptEntry[]
}

export interface SyncTranscriptResponse {
  ok: true
  length: number
}

export interface FinalizeSessionResponse {
  status: SessionStatus
  reason: SessionOutcomeReason | null
  results: SessionResults
}
