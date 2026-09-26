import type { CSSProperties } from 'react'

/**
 * Styling in this app is done with inline style objects. These are the shared
 * tokens and element styles; spread them and override per-usage.
 *
 * Design language: black field, white CMU Serif, film grain. No all-caps
 * labels, no letterspaced kickers, no colored panels. Square corners.
 * Blue and red appear only on the results spectrum, at equal weight.
 */
export const color = {
  bg: '#000000',
  panel: '#000000',
  panelRaised: '#0c0c0c',

  border: '#2a2a2a',
  borderStrong: '#4a4a4a',

  text: '#ffffff',
  textMuted: '#b0b0b0',
  textFaint: '#777777',

  accent: '#ffffff',
  accentText: '#000000',

  left: '#7aa2d4',
  right: '#d48a7a',
  win: '#8fbf9a',
  /** Distinct red for lose outcomes (stronger than spectrum right). */
  lose: '#c23a32',
  /** Soft red wash behind the full lose results viewport. */
  loseWash: '#1a0808',
  danger: '#e07070',
}

export const font = {
  serif: '"CMU Serif", "Latin Modern Roman", Georgia, "Times New Roman", serif',
  mono: '"CMU Typewriter Text", "SF Mono", ui-monospace, Menlo, monospace',
}

/**
 * Film grain over the whole viewport via body::before / theme token.
 * Higher baseFrequency = finer grit. Screen blend keeps it visible on black.
 */
export const grain: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  pointerEvents: 'none',
  mixBlendMode: 'screen',
  opacity: 0.14,
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.35' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='128' height='128' filter='url(%23g)'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'repeat',
}

export const page: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 32,
  paddingBottom: 32,
  paddingLeft: `max(${24}px, env(safe-area-inset-left))`,
  paddingRight: `max(${24}px, env(safe-area-inset-right))`,
  boxSizing: 'border-box',
  background: color.bg,
  color: color.text,
}

export const card: CSSProperties = {
  width: '100%',
  maxWidth: 540,
  background: 'transparent',
  border: 'none',
  padding: 0,
  boxSizing: 'border-box',
}

/** Frosted panel on the black field — blur + quiet edge, no shadow. */
export const glass: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  backdropFilter: 'blur(24px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
}

export const glassOverlay: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}

/** Small intro line above a heading — sentence case, not all-caps. */
export const kicker: CSSProperties = {
  fontSize: 15,
  color: color.textMuted,
}

export const heading: CSSProperties = {
  margin: 0,
  fontSize: 31,
  fontWeight: 700,
  lineHeight: 1.16,
  color: color.text,
}

export const subheading: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.6,
  color: color.textMuted,
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 14,
  color: color.textMuted,
  marginBottom: 8,
}

export const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  fontSize: 17,
  fontFamily: font.serif,
  color: color.text,
  background: color.panelRaised,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 0,
  outline: 'none',
}

export const glassInput: CSSProperties = {
  ...input,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
}

export const buttonBase: CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  fontSize: 17,
  fontFamily: font.serif,
  borderRadius: 0,
  border: `1px solid ${color.text}`,
  cursor: 'pointer',
  transition: 'opacity 120ms ease',
}

export const buttonPrimary: CSSProperties = {
  ...buttonBase,
  background: color.text,
  color: color.accentText,
}

export const buttonSecondary: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  color: color.text,
  borderColor: color.borderStrong,
}

export function disabled(style: CSSProperties, isDisabled: boolean): CSSProperties {
  return isDisabled ? { ...style, opacity: 0.4, cursor: 'not-allowed' } : style
}

export const errorBox: CSSProperties = {
  marginTop: 16,
  padding: '11px 14px',
  fontSize: 15,
  lineHeight: 1.5,
  color: color.danger,
  background: 'transparent',
  border: `1px solid ${color.danger}`,
}

/** Solid win/lose headline block (explicit exception to “no colored panels”). */
export const outcomeBanner = (won: boolean): CSSProperties => ({
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '22px 20px',
  background: won ? color.win : color.lose,
  color: won ? color.accentText : color.text,
  fontFamily: font.serif,
  fontSize: 'clamp(36px, 10vw, 64px)',
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '-0.02em',
  textAlign: 'center',
  borderRadius: 0,
})

export const noteBox: CSSProperties = {
  marginTop: 16,
  padding: '11px 14px',
  fontSize: 14,
  lineHeight: 1.5,
  color: color.textMuted,
  background: 'transparent',
  border: `1px solid ${color.border}`,
}
