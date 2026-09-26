import type { CSSProperties, ReactNode } from 'react'

import { SiteShareMark } from './SiteBrand'
import * as s from '../theme'

type Props = {
  won: boolean
  topicLabel: string
  center?: ReactNode
  /** Color metrics under the domain mark (outside the story crop). */
  metrics?: ReactNode
  detailLine?: string
  /** Optional CTA under the metrics (e.g. continue to full results). */
  actionLabel?: string
  onAction?: () => void
}

/**
 * Shareable win/lose screen.
 * Story crop (9:16): banner → topic → spectrum → ChangeMyMind.tech.
 * Metrics and CTA sit below the frame for the page.
 */
export default function ShareResultHero({
  won,
  topicLabel,
  center,
  metrics,
  detailLine,
  actionLabel,
  onAction,
}: Props) {
  const field: CSSProperties = {
    background: won ? s.color.bg : s.color.loseWash,
  }

  return (
    <section
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        ...field,
      }}
    >
      {/* Instagram-story crop: You won/lost → ChangeMyMind.tech */}
      <div
        style={{
          width: '100%',
          maxWidth: 'min(100%, calc(100dvh * 9 / 16), 480px)',
          marginLeft: 'auto',
          marginRight: 'auto',
          aspectRatio: won ? '9 / 16' : undefined,
          maxHeight: won ? '100dvh' : undefined,
          minHeight: won ? undefined : 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          paddingBottom: `max(10px, env(safe-area-inset-bottom))`,
          ...field,
        }}
      >
        <header style={{ flex: '0 0 auto', width: '100%' }}>
          <div
            style={{
              ...s.outcomeBanner(won),
              paddingTop: `max(12px, env(safe-area-inset-top))`,
              paddingBottom: won ? 18 : 12,
            }}
          >
            {won ? 'You won' : 'You lost'}
          </div>
          <p
            style={{
              margin: won ? '14px 16px 0' : '8px 12px 0',
              textAlign: 'center',
              fontFamily: s.font.serif,
              fontSize: won ? 16 : 15,
              fontStyle: 'italic',
              lineHeight: 1.35,
              color: s.color.text,
            }}
          >
            Argued on: {topicLabel}
          </p>
          {detailLine && (
            <p
              style={{
                margin: '6px 12px 0',
                textAlign: 'center',
                fontFamily: s.font.serif,
                fontSize: 14,
                lineHeight: 1.4,
                color: s.color.textMuted,
              }}
            >
              {detailLine}
            </p>
          )}
        </header>

        <div
          style={{
            flex: won ? '1 1 auto' : '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            minHeight: 0,
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: won ? 0 : 4,
            paddingBottom: won ? 0 : 4,
            boxSizing: 'border-box',
          }}
        >
          {center ?? <HeroCircleFrame compact={!won} />}
        </div>

        <div
          style={{
            flex: '0 0 auto',
            width: '100%',
            paddingTop: won ? 10 : 6,
            paddingLeft: 8,
            paddingRight: 8,
            boxSizing: 'border-box',
          }}
        >
          <SiteShareMark size="share" color={s.color.text} />
        </div>
      </div>

      {(metrics || (onAction && actionLabel)) && (
        <div
          style={{
            width: '100%',
            maxWidth: 'min(100%, calc(100dvh * 9 / 16), 560px)',
            marginLeft: 'auto',
            marginRight: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            paddingTop: won ? 20 : 12,
            paddingBottom: `max(16px, env(safe-area-inset-bottom))`,
            paddingLeft: `max(16px, env(safe-area-inset-left))`,
            paddingRight: `max(16px, env(safe-area-inset-right))`,
            boxSizing: 'border-box',
            ...field,
          }}
        >
          {metrics}
          {onAction && actionLabel && (
            <button
              type="button"
              onClick={onAction}
              style={{
                ...s.buttonPrimary,
                alignSelf: 'stretch',
                maxWidth: 420,
                marginTop: 4,
                minHeight: 48,
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

export function HeroCircleFrame({
  children,
  compact = false,
}: {
  children?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      style={{
        width: compact ? 'min(62%, 240px)' : 'min(70%, 42dvh, 300px)',
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        height: 'auto',
        maxHeight: compact ? 'min(38dvh, 240px)' : '42dvh',
        marginLeft: 'auto',
        marginRight: 'auto',
        borderRadius: '50%',
        border: `1px solid ${s.color.text}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'visible',
        flexShrink: 1,
        background: s.color.bg,
      }}
    >
      {children}
    </div>
  )
}
