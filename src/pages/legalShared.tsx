import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'

import { EDGE_PADDING } from '../onboardingLayout'
import * as s from '../theme'

const section: CSSProperties = {
  margin: 0,
}

const heading: CSSProperties = {
  ...s.heading,
  fontSize: 18,
  margin: '8px 0 0',
  fontWeight: 600,
}

/**
 * Shared chrome for Privacy / Terms pages.
 */
export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      style={{
        ...s.page,
        justifyContent: 'flex-start',
        paddingTop: 48,
        paddingBottom: 64,
        paddingLeft: `max(${EDGE_PADDING}px, env(safe-area-inset-left))`,
        paddingRight: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
      }}
    >
      <div style={{ width: '100%', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
        <p style={{ ...s.subheading, marginBottom: 12 }}>
          <Link to="/" style={{ color: s.color.textMuted }}>
            Back
          </Link>
        </p>
        <h1 style={s.heading}>{title}</h1>
        <p style={{ ...s.subheading, marginTop: 8, fontSize: 13, color: s.color.textFaint }}>
          4FRN Education LLC · Florida, United States
        </p>
        <div
          style={{
            ...s.subheading,
            marginTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            color: s.color.textMuted,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function LegalH({ children }: { children: ReactNode }) {
  return <h2 style={heading}>{children}</h2>
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p style={section}>{children}</p>
}
