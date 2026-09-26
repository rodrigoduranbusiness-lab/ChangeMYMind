import { polarToCartesian } from '@shared/scoring'
import { getTopic } from '@shared/topics'
import type { SessionResults } from '@shared/types'
import * as s from '../theme'

const SIZE = 340
/** Room for the edge ring, a dot sitting on it, and the labels outside. */
const PADDING = 42
const CENTER = SIZE / 2
const MAX_RADIUS = CENTER - PADDING

const RINGS = [0.25, 0.5, 0.75, 1]

/**
 * The polarization spectrum.
 *
 * Distance from the center is how polarized the user is (center =
 * open-minded, edge = polarized). Angle is the direction of lean: the left
 * half of the circle is left-leaning, the right half is right-leaning, and no
 * lean points straight up. Both halves are drawn identically, at the same
 * opacity — neither side is visually privileged.
 */
export default function Spectrum({ results }: { results: SessionResults }) {
  const user = polarToCartesian(CENTER, CENTER, results.radius * MAX_RADIUS, results.angle)

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      style={{ maxWidth: SIZE, display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={`Polarization ${Math.round(results.polarizationScore * 100)} out of 100, leaning ${
        results.angle < 90 ? 'right' : results.angle > 90 ? 'left' : 'neither direction'
      }`}
    >
      {/* Half tints, identical opacity on each side. */}
      <path
        d={halfCircle('left')}
        fill={s.color.left}
        opacity={0.05}
      />
      <path
        d={halfCircle('right')}
        fill={s.color.right}
        opacity={0.05}
      />

      {RINGS.map((ring) => (
        <circle
          key={ring}
          cx={CENTER}
          cy={CENTER}
          r={ring * MAX_RADIUS}
          fill="none"
          stroke={ring === 1 ? s.color.borderStrong : s.color.border}
          strokeWidth={1}
          strokeDasharray={ring === 1 ? undefined : '3 5'}
        />
      ))}

      {/* The vertical axis is the left/right divide. */}
      <line
        x1={CENTER}
        y1={CENTER - MAX_RADIUS}
        x2={CENTER}
        y2={CENTER + MAX_RADIUS}
        stroke={s.color.borderStrong}
        strokeWidth={1}
      />
      <line
        x1={CENTER - MAX_RADIUS}
        y1={CENTER}
        x2={CENTER + MAX_RADIUS}
        y2={CENTER}
        stroke={s.color.border}
        strokeWidth={1}
        strokeDasharray="3 5"
      />

      {/* Faint dots: where each topic sits on its own. */}
      {results.topicPoints.map((point) => {
        const position = polarToCartesian(CENTER, CENTER, point.radius * MAX_RADIUS, point.angle)
        return (
          <circle
            key={point.topic}
            cx={position.x}
            cy={position.y}
            r={5}
            fill={point.angle <= 90 ? s.color.right : s.color.left}
            opacity={0.38}
          >
            <title>{getTopic(point.topic).label}</title>
          </circle>
        )
      })}

      {/* The user's overall position. */}
      <circle cx={user.x} cy={user.y} r={14} fill={s.color.accent} opacity={0.18} />
      <circle
        cx={user.x}
        cy={user.y}
        r={6.5}
        fill={s.color.accent}
        stroke={s.color.bg}
        strokeWidth={2}
      />

      {/* Labels sit outside the ring so nothing collides with an edge dot. */}
      <text
        x={CENTER}
        y={PADDING - 20}
        textAnchor="middle"
        fill={s.color.textFaint}
        style={{ fontSize: 10, letterSpacing: '0.12em' }}
      >
        POLARIZED
      </text>
      <text
        x={CENTER + 7}
        y={CENTER - 7}
        textAnchor="start"
        fill={s.color.textFaint}
        style={{ fontSize: 10, letterSpacing: '0.12em' }}
      >
        OPEN
      </text>
      <text
        x={CENTER - MAX_RADIUS / 2}
        y={SIZE - PADDING + 30}
        textAnchor="middle"
        fill={s.color.left}
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}
      >
        LEFT
      </text>
      <text
        x={CENTER + MAX_RADIUS / 2}
        y={SIZE - PADDING + 30}
        textAnchor="middle"
        fill={s.color.right}
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}
      >
        RIGHT
      </text>
    </svg>
  )
}

/** Vertical half of the circle, as a path. */
function halfCircle(side: 'left' | 'right'): string {
  const top = CENTER - MAX_RADIUS
  const bottom = CENTER + MAX_RADIUS
  // sweep-flag 0 goes counter-clockwise (west side), 1 goes clockwise (east).
  const sweep = side === 'left' ? 0 : 1
  return `M ${CENTER} ${top} A ${MAX_RADIUS} ${MAX_RADIUS} 0 0 ${sweep} ${CENTER} ${bottom} Z`
}
