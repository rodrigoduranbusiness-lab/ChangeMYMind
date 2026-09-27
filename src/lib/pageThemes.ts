import type { CSSProperties } from 'react'

/** Homepage planet only — other routes stay plain black. */
export type PageThemeId = 'planet' | 'none'

export type PageTheme = {
  id: PageThemeId
  src: string
  filter: string
  opacity: number
  position: CSSProperties['backgroundPosition']
  mask: string
  size?: CSSProperties['backgroundSize']
  anchor?: {
    top?: string
    right?: string
    bottom?: string
    left?: string
    width: string
    height: string
  }
}

export const PLANET_THEME: PageTheme = {
  id: 'planet',
  src: '/earth-home.jpg',
  filter: 'grayscale(1) contrast(1.08) brightness(0.72)',
  opacity: 0.55,
  position: 'center',
  size: 'cover',
  mask: 'radial-gradient(ellipse 70% 70% at 55% 55%, #000 0%, #000 42%, transparent 78%)',
  anchor: {
    right: '-18%',
    bottom: '-12%',
    width: 'min(92vw, 520px)',
    height: 'min(92vw, 520px)',
  },
}

/** Planet on home only. Everywhere else: no photo. */
export function themeForPath(pathname: string): PageTheme | null {
  if (pathname === '/' || pathname.startsWith('/today')) return PLANET_THEME
  return null
}
