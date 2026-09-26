import type { CSSProperties } from 'react'

import * as s from '../theme'

/**
 * Sparse monochrome field motion — slow drifts and orbits on black.
 * Not a gradient wash; hairlines and dots that feel like a live instrument.
 */
export default function AmbientField() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ ...orb, width: 520, height: 520, top: '-12%', left: '-18%', animation: 'cg-drift-a 48s linear infinite' }} />
      <div style={{ ...orb, width: 380, height: 380, bottom: '-10%', right: '-12%', animation: 'cg-drift-b 62s linear infinite' }} />
      <div style={{ ...orbThin, width: 280, height: 280, top: '38%', right: '8%', animation: 'cg-drift-c 36s ease-in-out infinite' }} />

      {DOTS.map((dot) => (
        <span
          key={dot.id}
          style={{
            position: 'absolute',
            left: dot.x,
            top: dot.y,
            width: dot.size,
            height: dot.size,
            borderRadius: '50%',
            background: s.color.text,
            opacity: dot.opacity,
            animation: `cg-float ${dot.duration}s ease-in-out ${dot.delay}s infinite`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '22%',
          height: 1,
          background: 'rgba(255,255,255,0.06)',
          animation: 'cg-scan 28s linear infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '71%',
          height: 1,
          background: 'rgba(255,255,255,0.04)',
          animation: 'cg-scan 40s linear infinite reverse',
        }}
      />
    </div>
  )
}

const orb: CSSProperties = {
  position: 'absolute',
  borderRadius: '50%',
  border: '1px solid rgba(255,255,255,0.09)',
  boxSizing: 'border-box',
}

const orbThin: CSSProperties = {
  ...orb,
  border: '1px solid rgba(255,255,255,0.06)',
}

const DOTS = [
  { id: 1, x: '12%', y: '18%', size: 3, opacity: 0.35, duration: 11, delay: 0 },
  { id: 2, x: '78%', y: '14%', size: 2, opacity: 0.28, duration: 14, delay: 1.2 },
  { id: 3, x: '88%', y: '48%', size: 3, opacity: 0.32, duration: 12, delay: 0.4 },
  { id: 4, x: '22%', y: '62%', size: 2, opacity: 0.25, duration: 16, delay: 2 },
  { id: 5, x: '64%', y: '78%', size: 4, opacity: 0.22, duration: 13, delay: 0.8 },
  { id: 6, x: '41%', y: '28%', size: 2, opacity: 0.3, duration: 15, delay: 1.6 },
  { id: 7, x: '8%', y: '84%', size: 3, opacity: 0.2, duration: 18, delay: 0.2 },
  { id: 8, x: '52%', y: '8%', size: 2, opacity: 0.26, duration: 10, delay: 2.4 },
]
