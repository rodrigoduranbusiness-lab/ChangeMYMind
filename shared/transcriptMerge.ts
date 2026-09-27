import type { TranscriptEntry } from './types'

function entryKey(entry: TranscriptEntry): string {
  return `${entry.speaker}:${entry.text}:${entry.ts}`
}

/** Append incoming lines without duplicating speaker/text/ts tuples already stored. */
export function mergeTranscriptAppend(
  existing: TranscriptEntry[],
  incoming: TranscriptEntry[],
): TranscriptEntry[] {
  if (!incoming.length) {
    return existing
  }
  const seen = new Set(existing.map(entryKey))
  const merged = [...existing]
  for (const entry of incoming) {
    const key = entryKey(entry)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push(entry)
  }
  return merged
}

export function sanitizeTranscriptEntry(raw: unknown): TranscriptEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const row = raw as Record<string, unknown>
  if (row.speaker !== 'user' && row.speaker !== 'ai') {
    return null
  }
  if (typeof row.text !== 'string') {
    return null
  }
  const text = row.text
    // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .trim()
    .slice(0, 4000)
  if (!text) {
    return null
  }
  const ts =
    typeof row.ts === 'number' && Number.isFinite(row.ts) ? row.ts : Date.now()
  return { speaker: row.speaker, text, ts }
}

export function sanitizeTranscriptList(raw: unknown, max = 500): TranscriptEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const out: TranscriptEntry[] = []
  for (const item of raw) {
    const entry = sanitizeTranscriptEntry(item)
    if (entry) {
      out.push(entry)
    }
    if (out.length >= max) {
      break
    }
  }
  return out
}
