import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  DIAGNOSTIC_QUESTIONS,
  SCALE_LABELS,
  scoreDiagnostic,
  shuffleQuestionOrder,
} from '@shared/diagnostic'
import type { DiagnosticAnswer } from '@shared/types'
import { useAuth } from '../auth/context'
import { saveDiagnostic } from '../lib/api'
import * as s from '../theme'

const CONFIRM_MS = 500

export default function Diagnostic() {
  const { user, refreshDiagnostic } = useAuth()
  const navigate = useNavigate()

  const [order] = useState(() => shuffleQuestionOrder(DIAGNOSTIC_QUESTIONS.length))
  const [index, setIndex] = useState(0)
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      for (const id of timers.current) clearTimeout(id)
    }
  }, [])

  const question = DIAGNOSTIC_QUESTIONS[order[index]!]
  const total = DIAGNOSTIC_QUESTIONS.length
  const selected = values[question.id]
  const isLast = index === total - 1

  const progress = useMemo(
    () => Math.round(((index + (selected ? 1 : 0)) / total) * 100),
    [index, selected, total],
  )

  function schedule(ms: number, next: () => void) {
    const id = setTimeout(next, ms)
    timers.current.push(id)
  }

  async function finish(nextValues: Record<string, number>) {
    if (!user) {
      setLocked(false)
      return
    }
    setError(null)
    setSaving(true)

    try {
      const answers: DiagnosticAnswer[] = DIAGNOSTIC_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: nextValues[q.id],
      }))

      const result = scoreDiagnostic(answers)
      await saveDiagnostic(user.uid, result)
      await refreshDiagnostic()
      navigate('/briefing', { replace: true })
    } catch (caught) {
      console.error(caught)
      setError('We could not save your answers. Check your connection and try again.')
      setSaving(false)
      setLocked(false)
    }
  }

  function choose(value: number) {
    if (locked || saving) return

    const nextValues = { ...values, [question.id]: value }
    setValues(nextValues)
    setLocked(true)

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Hold the confirmed choice briefly, then advance — no white flash.
    schedule(reduceMotion ? 0 : CONFIRM_MS, () => {
      if (!isLast) {
        setIndex(index + 1)
        setLocked(false)
        return
      }
      void finish(nextValues)
    })
  }

  return (
    <div style={s.page}>
      <div style={{ ...s.card, maxWidth: 600 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
          }}
        >
          <span style={{ ...s.label, marginBottom: 0 }}>
            Question {index + 1} of {total}
          </span>
          <span style={{ fontSize: 12, color: s.color.textFaint }}>
            {question.kind === 'openness' ? 'About you' : 'Your take'}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 3,
            width: '100%',
            background: s.color.bg,
            overflow: 'hidden',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: s.color.text,
              transition: 'width 220ms ease',
            }}
          />
        </div>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: 22,
            lineHeight: 1.4,
            fontWeight: 500,
          }}
        >
          {question.statement}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SCALE_LABELS.map((scaleLabel, position) => {
            const value = position + 1
            const active = selected === value

            return (
              <button
                key={value}
                type="button"
                disabled={locked || saving}
                onClick={() => choose(value)}
                aria-pressed={active}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '13px 16px',
                  fontSize: 16,
                  fontFamily: s.font.serif,
                  textAlign: 'left',
                  color: active ? s.color.bg : s.color.text,
                  background: active ? s.color.text : 'transparent',
                  border: `1px solid ${active ? s.color.text : s.color.border}`,
                  cursor: locked || saving ? 'default' : 'pointer',
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 12,
                    height: 12,
                    border: `1px solid ${active ? s.color.bg : s.color.borderStrong}`,
                    background: active ? s.color.bg : 'transparent',
                  }}
                />
                {scaleLabel}
              </button>
            )
          })}
        </div>

        {index > 0 && !locked && !saving && (
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              style={{ ...s.buttonSecondary, width: 'auto', padding: '14px 20px' }}
            >
              Back
            </button>
          </div>
        )}

        {error && <div style={s.errorBox}>{error}</div>}
      </div>
    </div>
  )
}
