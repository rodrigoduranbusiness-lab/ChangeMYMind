import type { CSSProperties } from 'react'

/**
 * Styling in this app is done with inline style objects. These are the shared
 * tokens and element styles; spread them and override per-usage.
 *
 * On color: the primary action color is deliberately amber rather than blue or
 * red. Party colors appear only on the results spectrum, where both are needed
 * and are given identical weight.
 */
export const color = {
  bg: '#0d1117',
  panel: '#161b22',
  panelRaised: '#1c232d',
  border: '#2a313c',
  borderStrong: '#3d4653',
  text: '#e8eaed',
  textMuted: '#9aa4b2',
  textFaint: '#6b7684',
  accent: '#e0b050',
  accentText: '#1a1205',
  left: '#4a7fd4',
  right: '#d4544a',
  win: '#3fb950',
  lose: '#d4544a',
  danger: '#f85149',
}

export const font = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"SF Mono", ui-monospace, "Cascadia Mono", Menlo, monospace',
}

export const page: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 20px',
  boxSizing: 'border-box',
}

export const card: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  background: color.panel,
  border: `1px solid ${color.border}`,
  borderRadius: 16,
  padding: 32,
  boxSizing: 'border-box',
}

export const heading: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
}

export const subheading: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.55,
  color: color.textMuted,
}

export const label: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: color.textFaint,
  marginBottom: 8,
}

export const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '13px 14px',
  fontSize: 16,
  fontFamily: font.sans,
  color: color.text,
  background: color.bg,
  border: `1px solid ${color.borderStrong}`,
  borderRadius: 10,
  outline: 'none',
}

export const buttonBase: CSSProperties = {
  width: '100%',
  padding: '14px 20px',
  fontSize: 15,
  fontWeight: 600,
  fontFamily: font.sans,
  borderRadius: 10,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'opacity 120ms ease',
}

export const buttonPrimary: CSSProperties = {
  ...buttonBase,
  background: color.accent,
  color: color.accentText,
}

export const buttonSecondary: CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  color: color.text,
  borderColor: color.borderStrong,
}

export function disabled(style: CSSProperties, isDisabled: boolean): CSSProperties {
  return isDisabled
    ? { ...style, opacity: 0.45, cursor: 'not-allowed' }
    : style
}

export const errorBox: CSSProperties = {
  marginTop: 16,
  padding: '12px 14px',
  fontSize: 14,
  lineHeight: 1.5,
  color: '#ffd7d4',
  background: 'rgba(248, 81, 73, 0.1)',
  border: '1px solid rgba(248, 81, 73, 0.35)',
  borderRadius: 10,
}

export const noteBox: CSSProperties = {
  marginTop: 16,
  padding: '12px 14px',
  fontSize: 13,
  lineHeight: 1.5,
  color: color.textMuted,
  background: color.bg,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
}
