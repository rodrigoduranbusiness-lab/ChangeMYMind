import type { CSSProperties } from 'react'

type HueyAvatarSize = 'sm' | 'md' | 'lg'
type HueyAvatarVariant = 'mono' | 'color'

const SIZES: Record<HueyAvatarSize, number> = {
  sm: 40,
  md: 72,
  lg: 120,
}

/**
 * Soft overlapping blobs with rigid motion: shake, jab, tick-spin.
 */
export default function HueyAvatar({
  size = 'md',
  active = false,
  label = 'Huey',
  variant = 'mono',
}: {
  size?: HueyAvatarSize
  active?: boolean
  label?: string
  variant?: HueyAvatarVariant
}) {
  const px = SIZES[size]
  const color = variant === 'color'
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const motion = (
    name: string,
    duration: string,
    timing: string,
    extra?: CSSProperties,
  ): CSSProperties =>
    reduce
      ? { ...extra }
      : {
          ...extra,
          animation: `${name} ${duration} ${timing} infinite`,
        }

  const dur = (fast: string, slow: string) => (active ? fast : slow)

  const blob = (
    left: string,
    top: string,
    w: number,
    h: number,
    fill: string,
    anim: string,
    speed: [string, string],
    timing: string,
    opacity = 0.75,
  ) => (
    <div
      aria-hidden="true"
      style={motion(anim, dur(speed[0], speed[1]), timing, {
        position: 'absolute',
        left,
        top,
        width: px * w,
        height: px * h,
        borderRadius: '50%',
        background: fill,
        opacity,
        filter: `blur(${Math.max(1, px * 0.04)}px)`,
        mixBlendMode: 'screen',
      })}
    />
  )

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
        transition: 'opacity 320ms ease',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: '6%',
          borderRadius: '50%',
          background: color
            ? 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.12), transparent 70%)'
            : 'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.1), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {color ? (
        <>
          {blob('8%', '18%', 0.55, 0.55, 'rgba(64, 180, 255, 0.55)', 'huey-shake', ['0.55s', '0.9s'], 'steps(2)', 0.8)}
          {blob('38%', '8%', 0.5, 0.5, 'rgba(255, 140, 110, 0.5)', 'huey-jab', ['1.1s', '1.8s'], 'steps(3)', 0.75)}
          {blob('22%', '42%', 0.58, 0.58, 'rgba(255, 200, 80, 0.48)', 'huey-tick', ['1.4s', '2.2s'], 'steps(4)', 0.72)}
          {blob('48%', '40%', 0.48, 0.48, 'rgba(90, 220, 190, 0.5)', 'huey-shake', ['0.7s', '1.1s'], 'steps(2)', 0.7)}
          {blob('28%', '28%', 0.42, 0.42, 'rgba(180, 130, 255, 0.45)', 'huey-jab', ['0.95s', '1.5s'], 'steps(3)', 0.68)}
          {blob('15%', '55%', 0.36, 0.36, 'rgba(120, 200, 255, 0.4)', 'huey-spin-rigid', ['2.4s', '4s'], 'linear', 0.65)}
          {blob('55%', '22%', 0.34, 0.34, 'rgba(255, 170, 130, 0.42)', 'huey-spin-rigid', ['3.2s', '5.2s'], 'linear', 0.62)}
        </>
      ) : (
        <>
          {blob('10%', '20%', 0.52, 0.52, 'rgba(255,255,255,0.28)', 'huey-shake', ['0.65s', '1s'], 'steps(2)', 0.7)}
          {blob('40%', '12%', 0.48, 0.48, 'rgba(255,255,255,0.22)', 'huey-jab', ['1.2s', '1.9s'], 'steps(3)', 0.65)}
          {blob('24%', '44%', 0.55, 0.55, 'rgba(255,255,255,0.2)', 'huey-tick', ['1.5s', '2.4s'], 'steps(4)', 0.6)}
          {blob('48%', '38%', 0.44, 0.44, 'rgba(255,255,255,0.18)', 'huey-spin-rigid', ['2.8s', '4.5s'], 'linear', 0.55)}
          {blob('30%', '30%', 0.4, 0.4, 'rgba(255,255,255,0.16)', 'huey-shake', ['0.8s', '1.2s'], 'steps(2)', 0.5)}
        </>
      )}
    </div>
  )
}
