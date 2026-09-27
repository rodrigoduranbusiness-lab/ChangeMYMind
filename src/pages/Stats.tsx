import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import {
  Award,
  Flame,
  MessageSquare,
  PieChart,
  Trophy,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '../auth/context'
import OnboardingTopBrand from '../components/OnboardingTopBrand'
import { squircleMaskStyle } from '../lib/squircle'
import { stageShellStyle } from '../onboardingLayout'
import * as s from '../theme'

const chipSurface: CSSProperties = {
  ...squircleMaskStyle,
  border: 'none',
  borderRadius: 0,
  boxSizing: 'border-box',
}

type StatTone = {
  bg: string
  ink: string
  muted: string
}

const STAT_TONES: StatTone[] = [
  { bg: 'rgba(232, 120, 104, 0.62)', ink: '#ffd4cc', muted: 'rgba(255, 212, 204, 0.78)' },
  { bg: 'rgba(212, 168, 74, 0.62)', ink: '#ffe9b8', muted: 'rgba(255, 233, 184, 0.78)' },
  { bg: 'rgba(61, 184, 168, 0.62)', ink: '#b8f5ec', muted: 'rgba(184, 245, 236, 0.78)' },
  { bg: 'rgba(90, 143, 212, 0.64)', ink: '#c8dcff', muted: 'rgba(200, 220, 255, 0.78)' },
  { bg: 'rgba(154, 123, 200, 0.64)', ink: '#e4d4ff', muted: 'rgba(228, 212, 255, 0.78)' },
  { bg: 'rgba(143, 191, 154, 0.62)', ink: '#d4f0da', muted: 'rgba(212, 240, 218, 0.78)' },
]

function StatChip({
  value,
  Icon,
  label,
  tone,
}: {
  value: string | number
  Icon: LucideIcon
  label: string
  tone: StatTone
}) {
  return (
    <div
      style={{
        ...chipSurface,
        ...s.tintedFill(tone.bg),
        margin: 0,
        width: 90,
        height: 76,
        aspectRatio: '90 / 76',
        justifySelf: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '8px 4px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <Icon size={18} strokeWidth={1.85} color={tone.ink} aria-hidden />
        <span
          style={{
            fontFamily: s.font.serif,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: tone.ink,
          }}
        >
          {value}
        </span>
      </div>
      <span
        style={{
          fontFamily: s.font.serif,
          fontSize: 11,
          lineHeight: 1.2,
          color: tone.muted,
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  )
}

export default function Stats() {
  const navigate = useNavigate()
  const {
    user,
    wins,
    streak,
    longestStreak,
    debateRoundCount,
    debatesWon,
    refreshProfile,
  } = useAuth()

  const winRate =
    debateRoundCount > 0 ? Math.round((debatesWon / debateRoundCount) * 100) : 0

  useEffect(() => {
    if (!user) return
    void refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uid gate only
  }, [user?.uid])

  return (
    <div
      style={{
        ...stageShellStyle,
        background: 'transparent',
        color: s.color.text,
        overflowY: 'auto',
        paddingTop: `max(96px, calc(env(safe-area-inset-top) + 88px))`,
        paddingBottom: `max(40px, env(safe-area-inset-bottom))`,
      }}
    >
      <OnboardingTopBrand />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 540,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/today')}
          style={{
            margin: '0 0 16px',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontFamily: s.font.serif,
            fontSize: 15,
            color: s.color.textMuted,
          }}
        >
          ← Today
        </button>

        <h1 style={{ ...s.heading, fontSize: 36, margin: '0 0 10px' }}>Your stats</h1>
        <p style={{ ...s.subheading, fontSize: 15, marginBottom: 28 }}>
          Streaks, wins, and how often you show up.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, max-content)',
            gap: 10,
            width: 'max-content',
            maxWidth: '100%',
            marginLeft: 'auto',
            marginRight: 'auto',
            justifyContent: 'center',
            justifyItems: 'center',
          }}
        >
          <StatChip label="Current streak" value={streak} Icon={Flame} tone={STAT_TONES[0]} />
          <StatChip label="Wins" value={wins} Icon={Trophy} tone={STAT_TONES[1]} />
          <StatChip
            label="Longest streak"
            value={longestStreak}
            Icon={TrendingUp}
            tone={STAT_TONES[2]}
          />
          <StatChip
            label="Win rate"
            value={`${winRate}%`}
            Icon={PieChart}
            tone={STAT_TONES[3]}
          />
          <StatChip
            label="Total debates"
            value={debateRoundCount}
            Icon={MessageSquare}
            tone={STAT_TONES[4]}
          />
          <StatChip label="Debates won" value={debatesWon} Icon={Award} tone={STAT_TONES[5]} />
        </div>

        <button
          type="button"
          onClick={() => navigate('/today')}
          style={{
            ...s.buttonPrimary,
            borderRadius: 8,
            minHeight: 52,
            marginTop: 36,
            width: '100%',
          }}
        >
          Back to today’s debate
        </button>
      </div>
    </div>
  )
}
