import type { CSSProperties } from 'react'

type HueyAvatarSize = 'sm' | 'md' | 'lg' | 'xl'
type HueyAvatarVariant = 'mono' | 'color'
type Sides = 3 | 4 | 5

const SIZES: Record<HueyAvatarSize, number> = {
  sm: 40,
  md: 72,
  lg: 120,
  xl: 280,
}

/** CSS clip-path for a regular n-gon, tip-up, in percent of the box. */
function clipPath(sides: Sides): string {
  const pts: string[] = []
  const start = -Math.PI / 2
  for (let i = 0; i < sides; i++) {
    const a = start + (i * 2 * Math.PI) / sides
    const x = 50 + 48 * Math.cos(a)
    const y = 50 + 48 * Math.sin(a)
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`)
  }
  return `polygon(${pts.join(', ')})`
}

type Piece = {
  sides: Sides
  left: string
  top: string
  scale: number
  rot: number
  fill: string
  delay?: string
  reverse?: boolean
}

/** Just shapes stacked — offset so they overlap, not nested on center. */
const COLOR: Piece[] = [
  { sides: 5, left: '6%', top: '18%', scale: 0.7, rot: -12, fill: '#7ec8ff', delay: '0s' },
  { sides: 4, left: '28%', top: '8%', scale: 0.58, rot: 18, fill: '#ffb4a2', delay: '0.4s', reverse: true },
  { sides: 3, left: '10%', top: '32%', scale: 0.64, rot: -6, fill: '#ffe08a', delay: '0.8s' },
  { sides: 5, left: '32%', top: '28%', scale: 0.54, rot: 14, fill: '#9aefc8', delay: '0.2s', reverse: true },
  { sides: 4, left: '20%', top: '40%', scale: 0.46, rot: -20, fill: '#d4b4ff', delay: '0.6s' },
  { sides: 3, left: '40%', top: '42%', scale: 0.38, rot: 10, fill: '#ff9aad', delay: '1s', reverse: true },
]

const MONO: Piece[] = COLOR.map((p, i) => ({
  ...p,
  fill: `rgba(255,255,255,${(0.92 - i * 0.1).toFixed(2)})`,
}))

/**
 * Huey as hard polygons stacked on each other (triangle → pentagon).
 */
export default function HueyAvatar({
  size = 'md',
  active = false,
  label = 'Huey',
  variant = 'mono',
}: {
  size?: HueyAvatarSize | number
  active?: boolean
  label?: string
  variant?: HueyAvatarVariant
}) {
  const px = typeof size === 'number' ? size : SIZES[size]
  const pieces = variant === 'color' ? COLOR : MONO
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        width: px,
        height: px,
        marginLeft: 'auto',
        marginRight: 'auto',
        flexShrink: 0,
        overflow: 'visible',
        background: 'transparent',
        opacity: active ? 1 : 0.92,
        transition: 'opacity 280ms ease',
      }}
    >
      {pieces.map((p, i) => {
        const dim = px * p.scale
        const shell: CSSProperties = {
          position: 'absolute',
          left: p.left,
          top: p.top,
          width: dim,
          height: dim,
          transform: `rotate(${p.rot}deg)`,
          zIndex: i + 1,
        }
        const face: CSSProperties = {
          width: '100%',
          height: '100%',
          background: p.fill,
          clipPath: clipPath(p.sides),
          WebkitClipPath: clipPath(p.sides),
          ...(reduce
            ? {}
            : {
                animation: `huey-rock ${active ? '3.2s' : '5.5s'} ease-in-out infinite${
                  p.reverse ? ' reverse' : ''
                }`,
                animationDelay: p.delay ?? '0s',
              }),
        }
        return (
          <div key={i} aria-hidden="true" style={shell}>
            <div style={face} />
          </div>
        )
      })}
    </div>
  )
}
