import type { CSSProperties } from 'react'

import * as s from '../theme'

export const SITE_NAME = 'ChangeMyMind.tech'

/** Share-card mark (all caps). */
export const SITE_SHARE_MARK = 'CHANGEMYMIND.TECH'

const fullBleedShell: CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  marginLeft: 'auto',
  marginRight: 'auto',
  boxSizing: 'border-box',
  paddingLeft: 'max(12px, env(safe-area-inset-left))',
  paddingRight: 'max(12px, env(safe-area-inset-right))',
  overflow: 'hidden',
}

export function SiteBrand({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: s.font.serif,
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.02em',
        color: s.color.text,
        ...style,
      }}
    >
      {SITE_NAME}
    </span>
  )
}

type ShareMarkProps = {
  /** Span the full viewport width (breaks out of narrow columns). */
  fullWidth?: boolean
  /** share = result hero footer (fits long domain); debate = live header; hero = general. */
  size?: 'chrome' | 'hero' | 'debate' | 'share'
  color?: string
  style?: CSSProperties
}

/** Domain mark at headline scale — full width of the screen. */
export function SiteShareMark({
  fullWidth = true,
  size = 'hero',
  color = s.color.text,
  style,
}: ShareMarkProps) {
  // Bound to viewport so ChangeMyMind.tech never clips (incl. ".tech").
  const fontSize =
    size === 'debate'
      ? 'min(28px, 5vw, calc((100vw - 32px) / 15.2))'
      : size === 'share'
        ? 'clamp(17px, 4.6vw, calc((100vw - 28px) / 15.2))'
        : size === 'hero'
          ? 'min(42px, 6.5vw, calc((100vw - 40px) / 15.2))'
          : 'min(28px, 4.5vw, calc((100vw - 40px) / 14))'

  const bleedShell: CSSProperties =
    size === 'debate'
      ? {
          ...fullBleedShell,
          paddingLeft: 'max(6px, env(safe-area-inset-left))',
          paddingRight: 'max(6px, env(safe-area-inset-right))',
        }
      : fullBleedShell

  const inner = (
    <div
      style={{
        width: '100%',
        maxWidth: '100%',
        textAlign: 'center',
        fontFamily: s.font.serif,
        fontSize,
        fontWeight: 700,
        lineHeight: 0.95,
        letterSpacing:
          size === 'debate' ? '-0.04em' : size === 'share' ? '-0.025em' : '-0.03em',
        color,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {SITE_NAME}
    </div>
  )

  if (!fullWidth) {
    return inner
  }

  return <div style={bleedShell}>{inner}</div>
}

export function SiteBrandFooter({
  topicLine,
  style,
}: {
  topicLine?: string
  style?: CSSProperties
}) {
  return (
    <footer
      style={{
        textAlign: 'center',
        paddingTop: 28,
        paddingBottom: 8,
        ...style,
      }}
    >
      <SiteShareMark size="hero" color={s.color.text} />
      {topicLine && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 14,
            lineHeight: 1.45,
            color: s.color.textFaint,
            maxWidth: 420,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {topicLine}
        </p>
      )}
    </footer>
  )
}

/** Fixed top brand for onboarding / today flows. */
export function SiteMasthead({ fixed = false }: { fixed?: boolean }) {
  return (
    <div
      style={{
        position: fixed ? 'fixed' : 'relative',
        top: fixed ? `max(12px, env(safe-area-inset-top))` : undefined,
        left: 0,
        right: 0,
        zIndex: 20,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        paddingLeft: `max(16px, env(safe-area-inset-left))`,
        paddingRight: `max(16px, env(safe-area-inset-right))`,
      }}
    >
      <SiteBrand style={{ pointerEvents: 'auto' }} />
    </div>
  )
}
