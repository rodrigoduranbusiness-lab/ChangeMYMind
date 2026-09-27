import type { CSSProperties } from 'react'

/**
 * Static edge color — tight colored inner-shadow rim.
 * Filmic tungsten / slate / rust — not a Google/Siri rainbow.
 * Colors hug the perimeter; center stays mostly black for readable text.
 */
const rim: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  boxShadow: [
    'inset 0 52px 64px -40px rgba(196, 148, 92, 0.34)',
    'inset 0 -56px 68px -42px rgba(72, 86, 78, 0.4)',
    'inset 56px 0 68px -42px rgba(118, 92, 74, 0.32)',
    'inset -56px 0 68px -42px rgba(88, 102, 118, 0.36)',
    'inset 40px 40px 52px -36px rgba(156, 112, 72, 0.22)',
    'inset -40px -40px 52px -36px rgba(64, 78, 70, 0.28)',
    'inset 0 0 52px 30px rgba(0, 0, 0, 0.72)',
  ].join(', '),
}

const corners: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background: [
    'radial-gradient(ellipse 40% 30% at 0% 0%, rgba(196,148,92,0.26) 0%, transparent 72%)',
    'radial-gradient(ellipse 38% 28% at 100% 0%, rgba(88,102,118,0.24) 0%, transparent 72%)',
    'radial-gradient(ellipse 40% 30% at 100% 100%, rgba(72,86,78,0.28) 0%, transparent 72%)',
    'radial-gradient(ellipse 38% 28% at 0% 100%, rgba(118,92,74,0.22) 0%, transparent 72%)',
  ].join(', '),
}

const centerScrim: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background:
    'radial-gradient(ellipse 85% 80% at 50% 45%, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.38) 50%, transparent 78%)',
}

export default function ColorBlobs() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div style={corners} />
      <div style={rim} />
      <div style={centerScrim} />
    </div>
  )
}
