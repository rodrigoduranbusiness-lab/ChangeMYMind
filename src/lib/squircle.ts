import type { CSSProperties } from 'react'

/**
 * Superellipse / squircle path helpers.
 * n ≈ 4–5 reads as an organic “log ease” into the corner — not a circular arc.
 */

/** Parametric superellipse point in object-bounding-box space [0,1]². */
function superellipsePoint(t: number, n: number): [number, number] {
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const exp = 2 / n
  const x = Math.sign(cos) * Math.pow(Math.abs(cos), exp)
  const y = Math.sign(sin) * Math.pow(Math.abs(sin), exp)
  return [(x + 1) / 2, (y + 1) / 2]
}

/**
 * Closed SVG path for a unit squircle (objectBoundingBox / 0–1 coords).
 * Higher `n` → closer to a rectangle; ~4–5 is a soft organic corner.
 */
export function squirclePath(n = 4.6, steps = 64): string {
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 - Math.PI / 2
    const [x, y] = superellipsePoint(t, n)
    const xs = x.toFixed(5)
    const ys = y.toFixed(5)
    parts.push(i === 0 ? `M ${xs} ${ys}` : `L ${xs} ${ys}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

const DEFAULT_PATH = squirclePath(4.6, 72)

/** Inline SVG used as a CSS mask (scales to any box). */
export function squircleMaskSvg(path = DEFAULT_PATH): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1' preserveAspectRatio='none'>` +
    `<path d='${path}' fill='white'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const MASK = squircleMaskSvg()

/** Apply as inline style — organic corners without CSS border-radius. */
export const squircleMaskStyle: CSSProperties = {
  WebkitMaskImage: MASK,
  maskImage: MASK,
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition: 'center',
  // Progressive enhancement where supported; SVG mask is the real treatment.
  ...({ cornerShape: 'squircle' } as CSSProperties),
}
