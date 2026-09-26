import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'

import AmbientField from '../components/AmbientField'
import * as s from '../theme'

const shellPage: CSSProperties = {
  ...s.page,
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  position: 'relative',
  zIndex: 1,
  background: 'transparent',
}

const inner: CSSProperties = {
  width: '100%',
  maxWidth: 920,
  margin: '0 auto',
  boxSizing: 'border-box',
  position: 'relative',
  zIndex: 1,
}

export function EducationShell({
  title,
  subtitle,
  headerMeta,
  titleAside,
  children,
  backTo,
  backLabel = 'Back',
}: {
  title: string
  subtitle?: string
  /** Renders above the page title (e.g. class join code row). */
  headerMeta?: ReactNode
  /** Inline metadata on the same row as the page title. */
  titleAside?: ReactNode
  children: ReactNode
  backTo?: string
  backLabel?: string
}) {
  return (
    <div style={shellPage} className="cg-ambient">
      <AmbientField />
      <div style={inner}>
        {backTo && (
          <Link
            to={backTo}
            style={{
              display: 'inline-block',
              marginBottom: 20,
              fontSize: 14,
              color: s.color.textMuted,
              textDecoration: 'none',
            }}
          >
            ← {backLabel}
          </Link>
        )}

        {headerMeta}

        {titleAside ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: '6px 14px',
              marginBottom: subtitle ? 8 : 20,
            }}
          >
            <h1 style={{ ...s.heading, fontSize: 28, margin: 0 }}>{title}</h1>
            {titleAside}
          </div>
        ) : (
          <h1 style={{ ...s.heading, fontSize: 28, marginBottom: subtitle ? 8 : 20 }}>{title}</h1>
        )}
        {subtitle && (
          <p style={{ ...s.subheading, marginBottom: 28, maxWidth: 640 }}>{subtitle}</p>
        )}

        {children}
      </div>
    </div>
  )
}

export const eduSectionTitle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 17,
  fontWeight: 600,
  color: s.color.text,
}

export const eduRow: CSSProperties = {
  ...s.buttonSecondary,
  display: 'block',
  textAlign: 'left',
  textDecoration: 'none',
  boxSizing: 'border-box',
  minHeight: 48,
  fontSize: 15,
  marginBottom: 8,
  color: s.color.text,
}

export const eduStatGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
  marginBottom: 28,
}

/** Label + value columns on one row (class header stats). */
export const eduStatRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  gap: '8px 40px',
  marginBottom: 28,
  paddingBottom: 20,
  borderBottom: `1px solid ${s.color.border}`,
}

export function EduStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        border: `1px solid ${s.color.border}`,
        background: 'transparent',
      }}
    >
      <div style={{ fontSize: 13, color: s.color.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: s.color.text }}>{value}</div>
    </div>
  )
}

export function EduStatColumn({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: '0 0 auto' }}>
      <div style={{ fontSize: 13, color: s.color.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: s.color.text, lineHeight: 1.2 }}>{value}</div>
    </div>
  )
}

export function TitleMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 15, lineHeight: 1.4, color: s.color.text }}>
      <span style={{ color: s.color.textMuted }}>{label} </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  )
}

export function TitleMetaLink({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <Link
      to={to}
      style={{
        fontSize: 15,
        lineHeight: 1.4,
        color: s.color.text,
        textDecoration: 'none',
      }}
    >
      <span style={{ color: s.color.textMuted }}>{label} </span>
      <span style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>{value}</span>
    </Link>
  )
}

export function TitleMetaDot() {
  return (
    <span style={{ color: s.color.textFaint, fontSize: 15, userSelect: 'none' }} aria-hidden="true">
      ·
    </span>
  )
}
