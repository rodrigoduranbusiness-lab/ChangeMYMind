import { polarToCartesian } from '@shared/scoring'
import { getTopic } from '@shared/topics'
import type { SessionResults } from '@shared/types'
import * as s from '../theme'

const SIZE_FULL = 360
const SIZE_COMPACT = 320

function layout(compact: boolean) {
  const SIZE = compact ? SIZE_COMPACT : SIZE_FULL
  // Less padding = more of the circle visible in the first viewport.
  const PADDING = compact ? 28 : 36
  const CENTER = SIZE / 2
  const MAX_RADIUS = CENTER - PADDING
  return { SIZE, PADDING, CENTER, MAX_RADIUS }
}

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
export default function Spectrum({
  results,
  compact = false,
  /** Always show axis labels (Left / Right / Open / Polarized). */
  labeled = false,
}: {
  results: SessionResults
  compact?: boolean
  labeled?: boolean
}) {
  const { SIZE, PADDING, CENTER, MAX_RADIUS } = layout(compact)
  const user = polarToCartesian(CENTER, CENTER, results.radius * MAX_RADIUS, results.angle)
  const showLabels = labeled || !compact

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width="100%"
      style={{ maxWidth: SIZE, display: 'block', margin: '0 auto' }}
      role="img"
      aria-label={`Where you are politically: polarization ${Math.round(results.polarizationScore * 100)} out of 100, leaning ${
        results.angle < 90 ? 'right' : results.angle > 90 ? 'left' : 'neither direction'
      }`}
    >
      {/* Half tints, identical opacity on each side. */}
      <path
        d={halfCircle('left', CENTER, MAX_RADIUS)}
        fill={s.color.left}
        opacity={0.08}
      />
      <path
        d={halfCircle('right', CENTER, MAX_RADIUS)}
        fill={s.color.right}
        opacity={0.08}
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
        stroke={s.color.panel}
        strokeWidth={2}
      />

      {showLabels && (
        <>
          <text
            x={CENTER}
            y={PADDING - 12}
            textAnchor="middle"
            fill={s.color.textFaint}
            style={{ fontSize: 11, fontFamily: s.font.serif }}
          >
            Polarized
          </text>
          <text
            x={CENTER + 7}
            y={CENTER - 7}
            textAnchor="start"
            fill={s.color.textFaint}
            style={{ fontSize: 11, fontFamily: s.font.serif }}
          >
            Open
          </text>
          <text
            x={CENTER - MAX_RADIUS / 2}
            y={SIZE - PADDING + 22}
            textAnchor="middle"
            fill={s.color.left}
            style={{ fontSize: 12, fontFamily: s.font.serif }}
          >
            Left
          </text>
          <text
            x={CENTER + MAX_RADIUS / 2}
            y={SIZE - PADDING + 22}
            textAnchor="middle"
            fill={s.color.right}
            style={{ fontSize: 12, fontFamily: s.font.serif }}
          >
            Right
          </text>
        </>
      )}
    </svg>
  )
}

/** Vertical half of the circle, as a path. */
function halfCircle(side: 'left' | 'right', center: number, maxRadius: number): string {
  const top = center - maxRadius
  const bottom = center + maxRadius
  const sweep = side === 'left' ? 0 : 1
  return `M ${center} ${top} A ${maxRadius} ${maxRadius} 0 0 ${sweep} ${center} ${bottom} Z`
}
