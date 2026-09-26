import { useEffect, useRef, useState } from 'react'

import {
  LINE_HEIGHT,
  LINE_SIZE,
  TYPE_CHAR_MS,
  TYPE_CHAR_MS_PUNCT,
} from '../onboardingLayout'
import * as s from '../theme'
const DEFAULT_HOLD_MS = 550
const DEFAULT_FADE_MS = 320

type Props = {
  text: string
  holdMs?: number
  fadeMs?: number
  weight?: number
  /** When true, stay on screen after typing (no fade) and call onDone. */
  stay?: boolean
  /** Preserve newlines in the typed text. */
  preLine?: boolean
  onDone: () => void
}

/**
 * One line that types in, holds, optionally fades out — same cadence as the
 * landing intro, reusable for the post-quiz briefing.
 */
export default function AppearingLine({
  text,
  holdMs = DEFAULT_HOLD_MS,
  fadeMs = DEFAULT_FADE_MS,
  weight = 500,
  stay = false,
  preLine = false,
  onDone,
}: Props) {
  const [chars, setChars] = useState(0)
  const [fading, setFading] = useState(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    function schedule(ms: number, next: () => void) {
      const id = setTimeout(() => {
        timers.delete(id)
        if (!cancelled) next()
      }, ms)
      timers.add(id)
    }

    if (prefersReducedMotion) {
      setChars(text.length)
      setFading(false)
      schedule(stay ? 400 : holdMs, () => {
        if (!stay) setFading(true)
        schedule(stay ? 0 : fadeMs, () => onDoneRef.current())
      })
      return () => {
        cancelled = true
        for (const id of timers) clearTimeout(id)
      }
    }

    setChars(0)
    setFading(false)

    function typeChar(i: number) {
      if (i < text.length) {
        setChars(i + 1)
        const ch = text[i]!
        schedule(/[.,—]/.test(ch) ? TYPE_CHAR_MS_PUNCT : TYPE_CHAR_MS, () => typeChar(i + 1))
        return
      }
      schedule(holdMs, () => {
        if (stay) {
          onDoneRef.current()
          return
        }
        setFading(true)
        schedule(fadeMs, () => onDoneRef.current())
      })
    }

    typeChar(0)
    return () => {
      cancelled = true
      for (const id of timers) clearTimeout(id)
    }
  }, [text, holdMs, fadeMs, stay, prefersReducedMotion])

  const typing = chars < text.length && !prefersReducedMotion

  return (
    <p
      style={{
        margin: 0,
        fontSize: LINE_SIZE,
        fontWeight: weight,
        lineHeight: LINE_HEIGHT,
        color: s.color.text,
        opacity: fading ? 0 : 1,
        transition: fading ? `opacity ${fadeMs}ms ease` : undefined,
        whiteSpace: preLine ? 'pre-line' : undefined,
      }}
    >
      {text.slice(0, chars)}
      {typing && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: 2,
            height: '0.9em',
            marginLeft: 2,
            verticalAlign: '-0.05em',
            background: s.color.text,
            animation: 'cg-caret 1s steps(1) infinite',
          }}
        />
      )}
    </p>
  )
}
