import { defineSecret } from 'firebase-functions/params'

/**
 * The Gemini API key for the judge. It lives in Secret Manager and is only
 * ever read inside a Cloud Function — it is never sent to the browser. The
 * voice debater does not use this key at all; the client talks to the Live API
 * through Firebase AI Logic, which authenticates with the Firebase app itself.
 */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY')

/**
 * Text-only Flash model for the judge and the takeaways. Structured output and
 * low thinking levels keep per-turn latency acceptable during a live debate.
 */
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gemini-3.8-flash'

export const REGION = process.env.FUNCTIONS_REGION ?? 'us-central1'
