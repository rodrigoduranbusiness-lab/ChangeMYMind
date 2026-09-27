import { SITE_NAME } from './SiteBrand'
import * as s from '../theme'

/** Fixed site name on onboarding flows (sign-in, diagnostic, briefing). */
export default function OnboardingTopBrand() {
  return (
    <div
      aria-hidden="false"
      style={{
        position: 'fixed',
        top: `max(14px, env(safe-area-inset-top))`,
        left: 0,
        right: 0,
        zIndex: 15,
        pointerEvents: 'none',
        textAlign: 'center',
        paddingLeft: 52,
        paddingRight: 52,
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: s.font.serif,
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: s.color.text,
        }}
      >
        {SITE_NAME}
      </span>
    </div>
  )
}
