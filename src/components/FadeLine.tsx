import { useEffect, useRef, useState } from 'react'

import { LINE_HEIGHT, LINE_SIZE } from '../onboardingLayout'
import * as s from '../theme'

type Props = {
  text: string
  holdMs?: number
  fadeMs?: number
  weight?: number
  onDone: () => void
}

/** Full line fades in, holds, fades out — no typewriter effect. */
export default function FadeLine({
  text,
  holdMs = 600,
  fadeMs = 280,
  weight = 500,
  onDone,
}: Props) {
  const [visible, setVisible] = useState(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    if (prefersReducedMotion) {
      setVisible(true)
      timers.push(setTimeout(() => onDoneRef.current(), holdMs))
      return () => timers.forEach(clearTimeout)
    }

    setVisible(false)
    const startIn = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })

    timers.push(
      setTimeout(() => {
        setVisible(false)
        timers.push(setTimeout(() => onDoneRef.current(), fadeMs))
      }, fadeMs + holdMs),
    )

    return () => {
      cancelAnimationFrame(startIn)
      timers.forEach(clearTimeout)
    }
  }, [text, holdMs, fadeMs, prefersReducedMotion])

  return (
    <p
      style={{
        margin: 0,
        fontSize: LINE_SIZE,
        fontWeight: weight,
        lineHeight: LINE_HEIGHT,
        color: s.color.textMuted,
        opacity: visible ? 1 : 0,
        transition: prefersReducedMotion ? undefined : `opacity ${fadeMs}ms ease`,
      }}
    >
      {text}
    </p>
  )
}
