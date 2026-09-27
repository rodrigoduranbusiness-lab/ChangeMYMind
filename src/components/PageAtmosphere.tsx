import { useLocation } from 'react-router-dom'

import { themeForPath } from '../lib/pageThemes'

/**
 * Planet marble on the homepage only. Other routes stay black.
 */
export default function PageAtmosphere() {
  const { pathname } = useLocation()
  const theme = themeForPath(pathname)
  if (!theme) return null

  return (
    <div
      aria-hidden
      data-page-theme={theme.id}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: '#000000',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: theme.anchor?.top,
          right: theme.anchor?.right,
          bottom: theme.anchor?.bottom,
          left: theme.anchor?.left,
          width: theme.anchor?.width,
          height: theme.anchor?.height,
          backgroundImage: `url(${theme.src})`,
          backgroundSize: theme.size ?? 'cover',
          backgroundPosition: theme.position,
          backgroundRepeat: 'no-repeat',
          filter: theme.filter,
          opacity: theme.opacity,
          maskImage: theme.mask,
          WebkitMaskImage: theme.mask,
        }}
      />
    </div>
  )
}
