/** Shared geometry so intro → phone reads as one continuous sequence. */

/** Typing cadence (~80% of the original character rate). */
export const TYPE_CHAR_MS = 28
export const TYPE_CHAR_MS_PUNCT = 88

/** Extra pause with the full line visible before it fades (sign-in intro). */
export const INTRO_HOLD_AFTER_TYPED_MS = 2000

export const PHONE_PROMPT = 'Enter your phone number to get started'
export const CODE_PROMPT = 'Enter the code we sent.'

export const LINE_SIZE = 24
export const LINE_HEIGHT = 1.4
export const TEXT_SLOT_HEIGHT = Math.ceil(LINE_SIZE * LINE_HEIGHT * 3)
export const TEXT_SLOT_WIDTH = 560
export const TEXT_SLOT_TOP = '38%'
/** Horizontal inset so copy never sits edge-to-edge on mobile. */
export const EDGE_PADDING = 24

export const stageShellStyle = {
  position: 'fixed' as const,
  inset: 0,
  boxSizing: 'border-box' as const,
  paddingLeft: `max(${EDGE_PADDING}px, env(safe-area-inset-left))`,
  paddingRight: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
  paddingBottom: `max(${EDGE_PADDING}px, env(safe-area-inset-bottom))`,
}

export const textSlotStyle = {
  position: 'absolute' as const,
  top: TEXT_SLOT_TOP,
  // Inset from the viewport edges — absolute + width:100% ignores parent padding.
  left: `max(${EDGE_PADDING}px, env(safe-area-inset-left))`,
  right: `max(${EDGE_PADDING}px, env(safe-area-inset-right))`,
  width: 'auto',
  maxWidth: TEXT_SLOT_WIDTH,
  marginLeft: 'auto',
  marginRight: 'auto',
  boxSizing: 'border-box' as const,
  textAlign: 'left' as const,
}
