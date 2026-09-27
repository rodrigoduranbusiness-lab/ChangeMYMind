import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'

import {
  INTRO_HOLD_AFTER_TYPED_MS,
  LINE_HEIGHT,
  LINE_SIZE,
  PHONE_PROMPT,
  TEXT_SLOT_HEIGHT,
  TYPE_CHAR_MS,
  TYPE_CHAR_MS_PUNCT,
  stageShellStyle,
  textSlotStyle,
} from '../onboardingLayout'
import * as s from '../theme'

/**
 * Opening beat before phone auth. One line at a time: type in, hold, then
 * fade out. The last beat stacks "try to" over "Change My Mind.", drops the
 * prefix, holds the phrase, then the phone prompt types in the same slot.
 */
const LINES: { text: string; holdMs: number; fadeMs?: number; weight?: number }[] = [
  { text: 'We have a problem.', holdMs: 550 },
  { text: "We've lost the most important element of a functional society.", holdMs: 650 },
  { text: 'Civil debate.', holdMs: 700, weight: 700 },
  { text: 'On both sides', holdMs: 700, fadeMs: 220 },
  { text: 'we yell', holdMs: 220, fadeMs: 200 },
  { text: 'we hate', holdMs: 220, fadeMs: 200 },
  { text: 'we assume superiority.', holdMs: 450, fadeMs: 280 },
  { text: "If you believe you're any different—", holdMs: 600 },
  { text: 'try to Change My Mind.', holdMs: 600, weight: 700 },
]

const LAST = LINES.length - 1
const PREFIX = 'try to'
const PHRASE = 'Change My Mind.'

const FADE_MS = 350
const PREFIX_FADE_MS = 500
const PHRASE_HOLD_MS = 700
const PHRASE_OUT_MS = 350

type Phase =
  | 'typing'
  | 'holding'
  | 'fading'
  | 'fadePrefix'
  | 'holdPhrase'
  | 'fadePhrase'
  | 'typingPhone'

type Props = {
  onDone: () => void
}

export default function OnboardingIntro({ onDone }: Props) {
  const [lineIndex, setLineIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [phoneChars, setPhoneChars] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const skipRef = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReducedMotion) {
      onDoneRef.current()
      return
    }

    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    function schedule(ms: number, next: () => void) {
      const id = setTimeout(() => {
        timers.delete(id)
        if (!cancelled && !skipRef.current) next()
      }, ms)
      timers.add(id)
    }

    function finish() {
      if (skipRef.current || cancelled) return
      skipRef.current = true
      onDoneRef.current()
    }

    function typePhonePrompt(char: number) {
      if (skipRef.current) return
      if (char < PHONE_PROMPT.length) {
        setPhoneChars(char + 1)
        const justTyped = PHONE_PROMPT[char]!
        const delay = /[.,—]/.test(justTyped) ? TYPE_CHAR_MS_PUNCT : TYPE_CHAR_MS
        schedule(delay, () => typePhonePrompt(char + 1))
        return
      }
      schedule(400, finish)
    }

    function beginPhonePrompt() {
      setPhase('typingPhone')
      setPhoneChars(0)
      typePhonePrompt(0)
    }

    function runLine(line: number) {
      if (skipRef.current || line >= LINES.length) {
        beginPhonePrompt()
        return
      }

      setLineIndex(line)
      setCharIndex(0)
      setPhase('typing')

      const current = LINES[line]!
      const isFinale = line === LAST
      const fadeMs = current.fadeMs ?? FADE_MS

      function typeChar(char: number) {
        if (skipRef.current) return
        if (char < current.text.length) {
          setCharIndex(char + 1)
          const justTyped = current.text[char]!
          const delay = /[.,—]/.test(justTyped) ? TYPE_CHAR_MS_PUNCT : TYPE_CHAR_MS
          schedule(delay, () => typeChar(char + 1))
          return
        }

        setPhase('holding')
        schedule(current.holdMs + INTRO_HOLD_AFTER_TYPED_MS, () => {
          if (isFinale) {
            setPhase('fadePrefix')
            schedule(PREFIX_FADE_MS, () => {
              setPhase('holdPhrase')
              schedule(PHRASE_HOLD_MS + INTRO_HOLD_AFTER_TYPED_MS, () => {
                setPhase('fadePhrase')
                schedule(PHRASE_OUT_MS, () => beginPhonePrompt())
              })
            })
            return
          }

          setPhase('fading')
          schedule(fadeMs, () => runLine(line + 1))
        })
      }

      typeChar(0)
    }

    runLine(0)
    return () => {
      cancelled = true
      for (const id of timers) clearTimeout(id)
      timers.clear()
    }
  }, [prefersReducedMotion])

  function skip() {
    if (skipRef.current) return
    skipRef.current = true
    // Call parent immediately so we never render a blank frame.
    onDoneRef.current()
  }

  const line = LINES[lineIndex]!
  const isFinale = lineIndex === LAST
  const lineFadeMs = line.fadeMs ?? FADE_MS
  const showFinale = isFinale && phase !== 'typingPhone'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={skip}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          skip()
        }
      }}
      style={{
        ...stageShellStyle,
        cursor: 'pointer',
        outline: 'none',
        border: 'none',
        background: 'transparent',
      }}
      aria-label="Introduction. Click to skip."
    >
      <div
        style={{
          ...textSlotStyle,
          height: phase === 'typingPhone' || showFinale ? 'auto' : TEXT_SLOT_HEIGHT,
          overflow: phase === 'typingPhone' || showFinale ? 'visible' : 'hidden',
        }}
      >
        {phase === 'typingPhone' ? (
          <p
            style={{
              margin: 0,
              fontSize: LINE_SIZE,
              fontWeight: 500,
              lineHeight: LINE_HEIGHT,
              color: s.color.text,
            }}
          >
            {PHONE_PROMPT.slice(0, phoneChars)}
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
          </p>
        ) : showFinale ? (
          <FinaleBlock phase={phase} typedChars={charIndex} />
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: LINE_SIZE,
              fontWeight: line.weight ?? 500,
              lineHeight: LINE_HEIGHT,
              color: s.color.text,
              opacity: phase === 'fading' ? 0 : 1,
              transition: phase === 'fading' ? `opacity ${lineFadeMs}ms ease` : undefined,
            }}
          >
            {line.text.slice(0, charIndex)}
            {phase === 'typing' && (
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
        )}
      </div>

      {phase === 'typingPhone' ? (
        <p
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 48,
            margin: 0,
            textAlign: 'center',
            fontSize: 13,
            color: s.color.textFaint,
          }}
        >
          Tap to continue
        </p>
      ) : (
        <p
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 48,
            margin: 0,
            textAlign: 'center',
            fontSize: 13,
            color: s.color.textFaint,
          }}
        >
          Click to skip
        </p>
      )}

      <Link
        to="/education"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 22,
          margin: 0,
          textAlign: 'center',
          fontSize: 13,
          color: s.color.textMuted,
          textDecoration: 'none',
        }}
      >
        For education
      </Link>
    </div>
  )
}

/**
 * Left-aligned finale: "try to" over "Change My Mind.", then prefix fades
 * and the full phrase holds before the phone prompt.
 */
function FinaleBlock({ phase, typedChars }: { phase: Phase; typedChars: number }) {
  const [prefixOut, setPrefixOut] = useState(false)
  const fadingOut = phase === 'fadePhrase'
  const full = `${PREFIX} ${PHRASE}`
  const typed = full.slice(0, typedChars)
  const stillTyping = phase === 'typing'

  const prefixTyped = Math.min(typed.length, PREFIX.length)
  const phraseTyped =
    stillTyping && typed.length > PREFIX.length + 1 ? typed.slice(PREFIX.length + 1) : stillTyping ? '' : PHRASE
  const showCaretOnPrefix = stillTyping && typedChars <= PREFIX.length
  const showCaretOnPhrase = stillTyping && typedChars > PREFIX.length

  useEffect(() => {
    if (phase === 'fadePrefix') {
      const id = requestAnimationFrame(() => setPrefixOut(true))
      return () => cancelAnimationFrame(id)
    }
    if (phase === 'holdPhrase' || phase === 'fadePhrase') {
      setPrefixOut(true)
    }
  }, [phase])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        width: '100%',
        textAlign: 'left',
        fontSize: 'clamp(18px, 5.2vw, 24px)',
        fontWeight: 700,
        lineHeight: LINE_HEIGHT,
        color: s.color.text,
        opacity: fadingOut ? 0 : 1,
        transition: fadingOut ? `opacity ${PHRASE_OUT_MS}ms ease` : undefined,
      }}
    >
      <div
        style={{
          opacity: prefixOut ? 0 : 1,
          transition: `opacity ${PREFIX_FADE_MS}ms ease`,
          minHeight: `${LINE_HEIGHT}em`,
          whiteSpace: 'pre',
        }}
      >
        {PREFIX.slice(0, prefixTyped)}
        {showCaretOnPrefix && <Caret />}
      </div>

      <div
        style={{
          whiteSpace: 'normal',
          maxWidth: '100%',
          overflowWrap: 'anywhere',
        }}
      >
        {phraseTyped}
        {showCaretOnPhrase && <Caret />}
      </div>
    </div>
  )
}

function Caret() {
  return (
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
  )
}
