import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import type { CSSProperties } from 'react'
import { Flame, Trophy, type LucideIcon } from 'lucide-react'

import { getCalendarDateKey } from '@shared/dailyTopics'
import type { HueyDayDoc } from '@shared/types'
import { useAuth } from '../auth/context'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import PixelWanderers from '../components/PixelWanderers'
import { db } from '../firebase'
import { getTodayTopic } from '../lib/dailyChoice'
import { squircleMaskStyle } from '../lib/squircle'
import { stageShellStyle, TYPE_CHAR_MS, TYPE_CHAR_MS_PUNCT } from '../onboardingLayout'
import * as s from '../theme'

const chipSurface: CSSProperties = {
  ...squircleMaskStyle,
  border: 'none',
  borderRadius: 0,
  boxSizing: 'border-box',
}

const primaryBtn: CSSProperties = {
  ...s.buttonPrimary,
  borderRadius: 8,
  minHeight: 52,
}

function HeaderChip({
  value,
  Icon,
  label,
}: {
  value: string | number
  Icon: LucideIcon
  label: string
}) {
  return (
    <div
      role="img"
      aria-label={`${label}: ${value}`}
      style={{
        ...chipSurface,
        background: 'rgba(255, 255, 255, 0.14)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '16px 24px',
        flex: '0 0 auto',
      }}
    >
      <Icon size={28} strokeWidth={1.75} color={s.color.text} aria-hidden />
      <span
        style={{
          fontFamily: s.font.serif,
          fontSize: 30,
          fontWeight: 700,
          lineHeight: 1,
          color: s.color.text,
        }}
      >
        {value}
      </span>
    </div>
  )
}

const QUESTION_ZONE_HEIGHT = 160

/** Today's debate question, then stance. Stats live on their own page. */
export default function Today() {
  const navigate = useNavigate()
  const topic = getTodayTopic()
  const { user, wins, streak, refreshProfile } = useAuth()
  const [hueyLearned, setHueyLearned] = useState<number | null>(null)
  const [questionChars, setQuestionChars] = useState(0)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 640px)').matches
      : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const onChange = () => setIsMobile(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const todayLabel = new Intl.DateTimeFormat('en-US', {
    ...(isMobile
      ? { month: 'numeric' as const, day: 'numeric' as const, year: '2-digit' as const }
      : { weekday: 'long' as const, month: 'long' as const, day: 'numeric' as const }),
    timeZone: 'America/New_York',
  }).format(new Date())

  useEffect(() => {
    if (!user) return
    void refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uid gate only
  }, [user?.uid])

  useEffect(() => {
    const text = topic.question
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce) {
      setQuestionChars(text.length)
      return
    }

    setQuestionChars(0)
    let cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()

    function schedule(ms: number, next: () => void) {
      const id = setTimeout(() => {
        timers.delete(id)
        if (!cancelled) next()
      }, ms)
      timers.add(id)
    }

    function typeChar(i: number) {
      if (i >= text.length) return
      setQuestionChars(i + 1)
      const ch = text[i]!
      schedule(/[.,?—!]/.test(ch) ? TYPE_CHAR_MS_PUNCT : TYPE_CHAR_MS, () =>
        typeChar(i + 1),
      )
    }

    schedule(180, () => typeChar(0))

    return () => {
      cancelled = true
      for (const id of timers) clearTimeout(id)
    }
  }, [topic.question])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const dateKey = getCalendarDateKey()
    void getDoc(doc(db, 'hueyDays', dateKey))
      .then((snap) => {
        if (cancelled) return
        if (!snap.exists()) {
          setHueyLearned(0)
          return
        }
        const data = snap.data() as HueyDayDoc
        setHueyLearned(data.contributions?.length ?? 0)
      })
      .catch(() => {
        if (!cancelled) setHueyLearned(null)
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  return (
    <div
      style={{
        ...stageShellStyle,
        background: 'transparent',
        color: s.color.text,
        overflowY: 'auto',
        paddingTop: `max(96px, calc(env(safe-area-inset-top) + 88px))`,
        paddingBottom: `max(32px, env(safe-area-inset-bottom))`,
        ...(isMobile
          ? {
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100dvh',
              boxSizing: 'border-box',
            }
          : {}),
      }}
    >
      {!isMobile && <PixelWanderers count={6} />}
      <OnboardingTopBrand />
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          maxWidth: 540,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
          ...(isMobile
            ? {
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
              }
            : {}),
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            width: '100%',
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          <p
            style={{
              margin: 0,
              marginRight: 'auto',
              fontFamily: s.font.serif,
              fontSize: 16,
              lineHeight: 1.35,
              color: s.color.textMuted,
            }}
          >
            Today is {todayLabel}
          </p>
          <p
            style={{
              margin: 0,
              marginLeft: 'auto',
              fontFamily: s.font.serif,
              fontSize: 16,
              lineHeight: 1.35,
              color: s.color.textMuted,
              textAlign: 'right',
            }}
          >
            {hueyLearned ?? 0} solver{(hueyLearned ?? 0) === 1 ? '' : 's'} today
          </p>
        </div>

        <div
          style={{
            height: QUESTION_ZONE_HEIGHT,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: isMobile ? 'flex-start' : 'center',
            textAlign: isMobile ? 'left' : 'center',
          }}
        >
          <h1
            style={{
              ...s.heading,
              fontSize: 36,
              margin: 0,
              textAlign: isMobile ? 'left' : 'center',
              width: '100%',
            }}
            aria-label={topic.question}
          >
            {topic.question.slice(0, questionChars)}
            {questionChars < topic.question.length && (
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
          </h1>
        </div>

        <button
          type="button"
          onClick={() => navigate('/stance')}
          style={{
            ...primaryBtn,
            marginTop: 18,
            width: '100%',
          }}
        >
          Debate
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            marginTop: isMobile ? 'auto' : 36,
            marginBottom: 8,
            paddingTop: isMobile ? 48 : 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <HeaderChip label="Streak" value={streak} Icon={Flame} />
            <HeaderChip label="Wins" value={wins} Icon={Trophy} />
          </div>
          <button
            type="button"
            onClick={() => navigate('/stats')}
            style={{
              margin: 0,
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: s.font.serif,
              fontSize: 15,
              lineHeight: 1.3,
              color: s.color.textMuted,
              textDecoration: 'none',
            }}
          >
            More stats
          </button>
        </div>
      </div>
    </div>
  )
}
