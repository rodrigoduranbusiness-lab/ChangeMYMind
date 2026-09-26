/**
 * Text-only Flash model for the judge and the takeaways. Runs on Vertex AI
 * (Agent Platform) with the Cloud Function's service account — no API key.
 * Structured output and low thinking levels keep per-turn latency acceptable.
 */
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gemini-2.5-flash'

export const REGION = process.env.FUNCTIONS_REGION ?? 'us-central1'

/** Vertex / Agent Platform location for judge + takeaways. */
export const VERTEX_LOCATION = process.env.VERTEX_LOCATION ?? 'us-central1'

export const GCP_PROJECT =
  process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? 'talkitthrough-12076'
