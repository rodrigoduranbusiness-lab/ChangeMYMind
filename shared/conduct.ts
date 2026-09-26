/** Client/server shared conduct rules and lightweight checks. */

export type ConductEventKind = 'interruption' | 'long_turn' | 'mild_insult' | 'yelling'

/** Interruptions (or 30s+ monologue) before instant loss. */
export const INTERRUPTIONS_TO_LOSE = 4

/** Sustained overlap events before conduct cap (brief overlap is ignored client-side). */
export const CONDUCT_EVENTS_NEEDS_WORK = 6

/** Max continuous user speech per turn (ms) — must leave room for a response. */
export const USER_MAX_SPEECH_MS = 30_000

/** Mic level while AI is speaking — must exceed this to start an overlap clock. */
export const INTERRUPTION_LEVEL_THRESHOLD = 0.12

/** User must talk over the AI this long (ms) to count one interruption. */
export const INTERRUPTION_OVERLAP_MS = 1_200

/** Min time between interruption reports (ms) — avoids stacking penalties. */
export const INTERRUPTION_REPORT_COOLDOWN_MS = 12_000

/** Mic RMS at or above this for {@link YELLING_SUSTAIN_MS} triggers instant loss. */
export const YELLING_LEVEL_THRESHOLD = 0.28

export const YELLING_SUSTAIN_MS = 2_200

/**
 * Severe hate / slur heuristic on transcribed speech (instant loss). Not exhaustive;
 * the judge also flags `severe_hate_speech` on each turn.
 */
const SEVERE_HATE_RE =
  /\b(kike|nigger|nigga|faggot|fag|tranny|retard|cunt|spic|chink|wetback)\b/i

/**
 * Directed cursing / abusive insults aimed at the other side. Instant loss —
 * casual "damn" alone is not enough; the abuse has to target someone.
 */
const OFFENSIVE_ABUSE_RE =
  /\b(fuck\s+you|fuck\s+off|go\s+fuck\s+yourself|screw\s+you|eat\s+shit|piece\s+of\s+shit|son\s+of\s+a\s+bitch|motherfucker|asshole|dumbass|dipshit|shithead|bastard|bitch|whore|slut)\b/i

export function detectSevereHateSpeech(text: string): boolean {
  return SEVERE_HATE_RE.test(text)
}

/** True when the user is cursing at / verbally abusing the other side. */
export function detectOffensiveAbuse(text: string): boolean {
  return OFFENSIVE_ABUSE_RE.test(text)
}

/** Instant-stop speech: slurs or directed offensive cursing. */
export function detectInstantLossSpeech(text: string): 'hate_speech' | 'incivility' | null {
  if (detectSevereHateSpeech(text)) return 'hate_speech'
  if (detectOffensiveAbuse(text)) return 'incivility'
  return null
}

export function conductEventIncrementsNeedsWork(_kind: ConductEventKind): boolean {
  return true
}
