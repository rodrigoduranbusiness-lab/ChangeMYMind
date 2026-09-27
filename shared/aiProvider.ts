/** Which LLM vendor powers judge, takeaways, and (when enabled) live voice. */
export type AiProvider = 'vertex' | 'grok'

export function parseAiProvider(
  raw: string | undefined,
  fallback: AiProvider = 'vertex',
): AiProvider {
  const value = raw?.trim().toLowerCase()
  if (value === 'grok') {
    return 'grok'
  }
  if (value === 'vertex') {
    return 'vertex'
  }
  return fallback
}
