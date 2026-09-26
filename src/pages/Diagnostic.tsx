import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  DIAGNOSTIC_QUESTIONS,
  SCALE_LABELS,
  scoreDiagnostic,
} from '@shared/diagnostic'
import { getTopic } from '@shared/topics'
import type { DiagnosticAnswer } from '@shared/types'
import { useAuth } from '../auth/context'
import { saveDiagnostic } from '../lib/api'
import * as s from '../theme'

export default function Diagnostic() {
  const { user, refreshDiagnostic } = useAuth()
  const navigate = useNavigate()

  const [index, setIndex] = useState(0)
  const [values, setValues] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const question = DIAGNOSTIC_QUESTIONS[index]
  const total = DIAGNOSTIC_QUESTIONS.length
  const selected = values[question.id]
  const isLast = index === total - 1

  const progress = useMemo(
    () => Math.round(((index + (selected ? 1 : 0)) / total) * 100),
    [index, selected, total],
  )

  function choose(value: number) {
    setValues((previous) => ({ ...previous, [question.id]: value }))
  }

  async function goNext() {
    if (selected === undefined) return

    if (!isLast) {
      setIndex(index + 1)
      return
    }

    if (!user) return
    setError(null)
    setSaving(true)

    try {
      const answers: DiagnosticAnswer[] = DIAGNOSTIC_QUESTIONS.map((q) => ({
        questionId: q.id,
        value: values[q.id],
      }))

      // Scored on the client so we can show the assigned topic immediately;
      // the debate itself re-reads this from Firestore server-side.
      const result = scoreDiagnostic(answers)
      await saveDiagnostic(user.uid, result)
      await refreshDiagnostic()
      navigate('/debate', { replace: true })
    } catch (caught) {
      console.error(caught)
      setError('We could not save your answers. Check your connection and try again.')
      setSaving(false)
    }
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
            {question.kind === 'openness' ? 'About you' : getTopic(question.topic!).label}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 4,
            width: '100%',
            background: s.color.bg,
            borderRadius: 999,
            overflow: 'hidden',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: s.color.accent,
              borderRadius: 999,
              transition: 'width 220ms ease',
            }}
          />
        </div>

        <p
          style={{
            margin: '0 0 24px',
            fontSize: 21,
            lineHeight: 1.4,
            fontWeight: 500,
            letterSpacing: '-0.01em',
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
                onClick={() => choose(value)}
                aria-pressed={active}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '13px 16px',
                  fontSize: 15,
                  fontFamily: s.font.sans,
                  textAlign: 'left',
                  color: active ? s.color.accent : s.color.text,
                  background: active ? 'rgba(224, 176, 80, 0.1)' : s.color.bg,
                  border: `1px solid ${active ? s.color.accent : s.color.border}`,
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: `1px solid ${active ? s.color.accent : s.color.borderStrong}`,
                    background: active ? s.color.accent : 'transparent',
                  }}
                />
                {scaleLabel}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              style={{ ...s.buttonSecondary, width: 'auto', padding: '14px 20px' }}
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={selected === undefined || saving}
            style={s.disabled(s.buttonPrimary, selected === undefined || saving)}
          >
            {saving ? 'Saving…' : isLast ? 'See my topic' : 'Next'}
          </button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}
      </div>
    </div>
  )
}
