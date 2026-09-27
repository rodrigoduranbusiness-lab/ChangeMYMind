import { useEffect, useMemo, useRef, useState } from 'react'

import * as s from '../theme'

const PX = 3
const W = 10
const H = 18

const GRID_COLS = 10
const GRID_ROWS = 5
/** Slow grid steps — feels like a stroll, not a sprint. */
const STEP_MS = 820
const TALK_BEATS = 8
const WANDER_STEPS = 4

const SKINS = ['#f0d0b0', '#d4a574', '#a0673f', '#5c3a24'] as const
const HAIRS = ['#1a1a1a', '#6b4423', '#c4a035', '#e8e0d4'] as const
const SHIRTS = ['#c45c4a', '#d4a84a', '#3db8a8', '#9a7bc8'] as const
const PANTS = ['#3d4a6b', '#6b5344', '#4a5c3d', '#5a5a68'] as const
/** Woman outfit accents (skirts / dresses). */
const SKIRTS = ['#c45c4a', '#9a7bc8', '#d48a9a', '#3db8a8'] as const
const SHOE = '#0a0a0a'

type HairStyle = 0 | 1 | 2 | 3
type Presentation = 'man' | 'woman'
type Dir = 'left' | 'right' | 'up' | 'down'
type Phase = 'seek' | 'talk' | 'wander'

type Look = {
  presentation: Presentation
  skin: string
  hair: string
  hairStyle: HairStyle
  shirt: string
  pants: string
}

type Agent = {
  id: number
  look: Look
  gx: number
  gy: number
  facing: Dir
  walkFrame: 0 | 1
  pairId: number
  /** 0 or 1 — who steps on even/odd ticks inside the pair */
  pairSlot: 0 | 1
  phase: Phase
  bubble: string | null
  talkBeat: number
  wanderLeft: number
}

const DIALOGUES: [string, string][] = [
  ['prove it', 'with what?'],
  ['no way', 'hear me out'],
  ['fair point', 'exactly'],
  ['wait—', 'and?'],
  ['hmm', 'think'],
  ['okay…', 'so?'],
  ['listen', 'I am'],
  ['really?', 'yes'],
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

function uniqueLooks(count: number): Look[] {
  const men: Look[] = []
  const women: Look[] = []
  for (let si = 0; si < 4; si++) {
    for (let hi = 0; hi < 4; hi++) {
      for (let hs = 0; hs < 4; hs++) {
        for (let sh = 0; sh < 4; sh++) {
          for (let pa = 0; pa < 4; pa++) {
            men.push({
              presentation: 'man',
              skin: SKINS[si]!,
              hair: HAIRS[hi]!,
              hairStyle: hs as HairStyle,
              shirt: SHIRTS[sh]!,
              pants: PANTS[pa]!,
            })
            women.push({
              presentation: 'woman',
              skin: SKINS[si]!,
              hair: HAIRS[hi]!,
              hairStyle: hs as HairStyle,
              shirt: SHIRTS[sh]!,
              pants: SKIRTS[pa]!,
            })
          }
        }
      }
    }
  }
  const half = Math.floor(count / 2)
  const womenCount = count - half // if odd, one extra woman
  return shuffle([
    ...shuffle(men).slice(0, half),
    ...shuffle(women).slice(0, womenCount),
  ])
}

function paintFrame(look: Look, walkFrame: 0 | 1, facing: Dir): Map<string, string> {
  const map = new Map<string, string>()
  const set = (x: number, y: number, c: string) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return
    map.set(`${x},${y}`, c)
  }
  const { presentation, skin, hair, hairStyle, shirt, pants } = look
  const woman = presentation === 'woman'

  // --- hair (man vs woman silhouettes) ---
  if (woman) {
    if (hairStyle === 0) {
      // long bob
      for (let x = 1; x <= 8; x++) set(x, 1, hair)
      for (let x = 1; x <= 8; x++) set(x, 2, hair)
      set(1, 3, hair)
      set(1, 4, hair)
      set(1, 5, hair)
      set(8, 3, hair)
      set(8, 4, hair)
      set(8, 5, hair)
    } else if (hairStyle === 1) {
      // ponytail
      for (let x = 2; x <= 7; x++) set(x, 1, hair)
      for (let x = 1; x <= 8; x++) set(x, 2, hair)
      set(0, 2, hair)
      set(0, 3, hair)
      set(0, 4, hair)
      set(0, 5, hair)
    } else if (hairStyle === 2) {
      // wavy long
      for (let x = 1; x <= 8; x++) set(x, 1, hair)
      for (let x = 1; x <= 8; x++) set(x, 2, hair)
      set(1, 3, hair)
      set(2, 4, hair)
      set(1, 5, hair)
      set(8, 3, hair)
      set(7, 4, hair)
      set(8, 5, hair)
    } else {
      // bangs + shoulder
      for (let x = 2; x <= 7; x++) set(x, 1, hair)
      for (let x = 1; x <= 8; x++) set(x, 2, hair)
      for (let x = 2; x <= 7; x++) set(x, 3, hair)
      set(1, 4, hair)
      set(8, 4, hair)
    }
  } else if (hairStyle === 0) {
    for (let x = 2; x <= 7; x++) set(x, 1, hair)
    for (let x = 1; x <= 8; x++) set(x, 2, hair)
  } else if (hairStyle === 1) {
    set(3, 0, hair)
    set(5, 0, hair)
    set(7, 0, hair)
    for (let x = 2; x <= 7; x++) set(x, 1, hair)
    for (let x = 1; x <= 8; x++) set(x, 2, hair)
  } else if (hairStyle === 2) {
    for (let x = 1; x <= 8; x++) set(x, 1, hair)
    for (let x = 1; x <= 8; x++) set(x, 2, hair)
    set(1, 3, hair)
    set(1, 4, hair)
    set(8, 3, hair)
    set(8, 4, hair)
  } else {
    set(4, 0, hair)
    set(5, 0, hair)
    for (let x = 2; x <= 7; x++) set(x, 1, hair)
    for (let x = 1; x <= 8; x++) set(x, 2, hair)
  }

  // --- head ---
  for (let y = 3; y <= 6; y++) {
    for (let x = 2; x <= 7; x++) set(x, y, skin)
  }
  set(3, 4, '#1a1a1a')
  set(6, 4, '#1a1a1a')

  // --- torso ---
  for (let y = 7; y <= 11; y++) {
    for (let x = 2; x <= 7; x++) set(x, y, shirt)
  }

  // Arms by sides
  set(1, 7, shirt)
  set(1, 8, shirt)
  set(1, 9, shirt)
  set(1, 10, skin)
  set(8, 7, shirt)
  set(8, 8, shirt)
  set(8, 9, shirt)
  set(8, 10, skin)
  if (walkFrame === 1) {
    set(1, 11, skin)
    map.delete('1,10')
  }

  if (woman) {
    // Dress / skirt silhouette from waist down
    for (let y = 12; y <= 15; y++) {
      const widen = y >= 14 ? 1 : 0
      for (let x = 2 - widen; x <= 7 + widen; x++) set(x, y, pants)
    }
    // Shoes under hem
    if (walkFrame === 0) {
      set(3, 16, SHOE)
      set(4, 16, SHOE)
      set(6, 16, SHOE)
      set(7, 16, SHOE)
    } else {
      set(2, 16, SHOE)
      set(3, 16, SHOE)
      set(7, 16, SHOE)
      set(8, 16, SHOE)
    }
  } else {
    for (let y = 12; y <= 13; y++) {
      for (let x = 2; x <= 7; x++) set(x, y, pants)
    }
    const vertical = facing === 'up' || facing === 'down'
    if (vertical) {
      if (walkFrame === 0) {
        set(3, 14, pants)
        set(3, 15, pants)
        set(3, 16, SHOE)
        set(4, 16, SHOE)
        set(6, 14, pants)
        set(6, 15, pants)
        set(6, 16, SHOE)
        set(7, 16, SHOE)
      } else {
        set(3, 14, pants)
        set(4, 14, pants)
        set(4, 15, pants)
        set(4, 16, SHOE)
        set(5, 16, SHOE)
        set(6, 14, pants)
        set(5, 14, pants)
        set(5, 15, pants)
        set(6, 16, SHOE)
        set(7, 16, SHOE)
      }
    } else if (walkFrame === 0) {
      set(2, 14, pants)
      set(3, 14, pants)
      set(2, 15, pants)
      set(2, 16, SHOE)
      set(3, 16, SHOE)
      set(6, 14, pants)
      set(7, 14, pants)
      set(7, 15, pants)
      set(6, 16, SHOE)
      set(7, 16, SHOE)
    } else {
      set(2, 14, pants)
      set(3, 14, pants)
      set(3, 15, pants)
      set(2, 16, SHOE)
      set(3, 16, SHOE)
      set(6, 14, pants)
      set(7, 14, pants)
      set(6, 15, pants)
      set(6, 16, SHOE)
      set(7, 16, SHOE)
    }
  }

  return map
}

function PixelSprite({
  look,
  walkFrame,
  facing,
}: {
  look: Look
  walkFrame: 0 | 1
  facing: Dir
}) {
  const pixels = useMemo(
    () => paintFrame(look, walkFrame, facing),
    [look, walkFrame, facing],
  )

  return (
    <div
      style={{
        position: 'relative',
        width: W * PX,
        height: H * PX,
        imageRendering: 'pixelated',
        transform: facing === 'left' ? 'scaleX(-1)' : undefined,
      }}
    >
      {[...pixels.entries()].map(([key, color]) => {
        const [xs, ys] = key.split(',')
        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: Number(xs) * PX,
              top: Number(ys) * PX,
              width: PX,
              height: PX,
              background: color,
            }}
          />
        )
      })}
    </div>
  )
}

function isSideBySide(a: { gx: number; gy: number }, b: { gx: number; gy: number }) {
  return a.gy === b.gy && Math.abs(a.gx - b.gx) === 1
}

function faceToward(from: { gx: number; gy: number }, to: { gx: number; gy: number }): Dir {
  const dx = to.gx - from.gx
  if (dx !== 0) return dx > 0 ? 'right' : 'left'
  const dy = to.gy - from.gy
  return dy >= 0 ? 'up' : 'down'
}

/** Stand immediately left or right of partner (same row). */
function sideMeetTarget(
  self: { gx: number; gy: number },
  other: { gx: number; gy: number },
): { gx: number; gy: number } {
  const left = other.gx - 1
  const right = other.gx + 1
  const leftOk = left >= 0
  const rightOk = right < GRID_COLS
  // Prefer the side we're already closer to
  if (self.gx <= other.gx && leftOk) return { gx: left, gy: other.gy }
  if (rightOk) return { gx: right, gy: other.gy }
  if (leftOk) return { gx: left, gy: other.gy }
  return { gx: other.gx, gy: other.gy }
}

/**
 * Path without marching as a column: match row first (vertical only),
 * then close horizontally on that row.
 */
function stepToward(
  from: { gx: number; gy: number },
  target: { gx: number; gy: number },
  occupied: Set<string>,
  selfKey: string,
): { gx: number; gy: number; dir: Dir } | null {
  const tryMove = (gx: number, gy: number, dir: Dir) => {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return null
    const key = `${gx},${gy}`
    if (key !== selfKey && occupied.has(key)) return null
    return { gx, gy, dir }
  }

  // Same row → only slide left/right toward target
  if (from.gy === target.gy) {
    if (from.gx < target.gx) return tryMove(from.gx + 1, from.gy, 'right')
    if (from.gx > target.gx) return tryMove(from.gx - 1, from.gy, 'left')
    return null
  }

  // Different row → only move up/down first (never diagonal column shuffle)
  if (from.gy < target.gy) {
    return (
      tryMove(from.gx, from.gy + 1, 'up') ??
      // blocked: sidestep then retry next tick
      tryMove(from.gx + 1, from.gy, 'right') ??
      tryMove(from.gx - 1, from.gy, 'left')
    )
  }
  return (
    tryMove(from.gx, from.gy - 1, 'down') ??
    tryMove(from.gx + 1, from.gy, 'right') ??
    tryMove(from.gx - 1, from.gy, 'left')
  )
}

function randomStep(
  from: { gx: number; gy: number },
  occupied: Set<string>,
  selfKey: string,
): { gx: number; gy: number; dir: Dir } | null {
  const opts: { gx: number; gy: number; dir: Dir }[] = []
  const tryPush = (gx: number, gy: number, dir: Dir) => {
    if (gx < 0 || gx >= GRID_COLS || gy < 0 || gy >= GRID_ROWS) return
    const key = `${gx},${gy}`
    if (key !== selfKey && occupied.has(key)) return
    opts.push({ gx, gy, dir })
  }
  tryPush(from.gx - 1, from.gy, 'left')
  tryPush(from.gx + 1, from.gy, 'right')
  tryPush(from.gx, from.gy - 1, 'down')
  tryPush(from.gx, from.gy + 1, 'up')
  if (!opts.length) return null
  return opts[Math.floor(Math.random() * opts.length)]!
}

function makeAgents(count: number): Agent[] {
  const n = count % 2 === 0 ? count : count + 1
  const half = n / 2
  const looks = uniqueLooks(n)
  const men = looks.filter((l) => l.presentation === 'man')
  const women = looks.filter((l) => l.presentation === 'woman')

  // Spread starts across columns so pairs don’t spawn in a stack
  const cells: { gx: number; gy: number }[] = []
  for (let gx = 0; gx < GRID_COLS; gx++) {
    for (let gy = 0; gy < GRID_ROWS; gy++) cells.push({ gx, gy })
  }
  const starts = shuffle(cells).slice(0, n)

  const agents: Agent[] = []
  for (let p = 0; p < half; p++) {
    const manStart = starts[p * 2]!
    const womanStart = starts[p * 2 + 1]!
    agents.push({
      id: p * 2 + 1,
      look: men[p] ?? looks[p * 2]!,
      gx: manStart.gx,
      gy: manStart.gy,
      facing: 'right',
      walkFrame: 0,
      pairId: p,
      pairSlot: 0,
      phase: 'seek',
      bubble: null,
      talkBeat: 0,
      wanderLeft: 0,
    })
    agents.push({
      id: p * 2 + 2,
      look: women[p] ?? looks[p * 2 + 1]!,
      gx: womanStart.gx,
      gy: womanStart.gy,
      facing: 'left',
      walkFrame: 0,
      pairId: p,
      pairSlot: 1,
      phase: 'seek',
      bubble: null,
      talkBeat: 0,
      wanderLeft: 0,
    })
  }
  return agents
}

function tickAgents(
  prev: Agent[],
  dialogues: [string, string][],
  tick: number,
): Agent[] {
  const next = prev.map((a) => ({ ...a, bubble: null as string | null, walkFrame: 0 as 0 | 1 }))
  const byPair = new Map<number, Agent[]>()
  for (const a of next) {
    const list = byPair.get(a.pairId) ?? []
    list.push(a)
    byPair.set(a.pairId, list)
  }

  const occupied = new Set(next.map((a) => `${a.gx},${a.gy}`))

  for (const [, pair] of byPair) {
    if (pair.length < 2) continue
    const [a, b] = pair as [Agent, Agent]
    const dialogue = dialogues[a.pairId % dialogues.length]!

    if (a.phase === 'talk' || b.phase === 'talk') {
      if (!isSideBySide(a, b)) {
        a.phase = 'seek'
        b.phase = 'seek'
        a.talkBeat = 0
        b.talkBeat = 0
        a.bubble = null
        b.bubble = null
        continue
      }
      a.facing = a.gx < b.gx ? 'right' : 'left'
      b.facing = b.gx < a.gx ? 'right' : 'left'
      a.walkFrame = 0
      b.walkFrame = 0
      const beat = Math.max(a.talkBeat, b.talkBeat)
      if (beat % 2 === 0) {
        a.bubble = dialogue[0]
        b.bubble = null
      } else {
        a.bubble = null
        b.bubble = dialogue[1]
      }
      a.talkBeat = beat + 1
      b.talkBeat = beat + 1
      if (beat + 1 >= TALK_BEATS) {
        a.phase = 'wander'
        b.phase = 'wander'
        a.wanderLeft = WANDER_STEPS
        b.wanderLeft = WANDER_STEPS
        a.talkBeat = 0
        b.talkBeat = 0
        a.bubble = null
        b.bubble = null
      }
      continue
    }

    if (isSideBySide(a, b) && a.phase === 'seek' && b.phase === 'seek') {
      a.phase = 'talk'
      b.phase = 'talk'
      a.talkBeat = 0
      b.talkBeat = 0
      a.facing = a.gx < b.gx ? 'right' : 'left'
      b.facing = b.gx < a.gx ? 'right' : 'left'
      a.bubble = dialogue[0]
      b.bubble = null
      continue
    }

    if (a.phase === 'wander' || b.phase === 'wander') {
      // Only one of the pair wanders each tick — avoids lockstep columns
      const mover = (tick + a.pairId) % 2 === 0 ? a : b
      if (mover.phase === 'wander') {
        const key = `${mover.gx},${mover.gy}`
        occupied.delete(key)
        const step = randomStep(mover, occupied, key)
        if (step) {
          mover.gx = step.gx
          mover.gy = step.gy
          mover.facing = step.dir
          mover.walkFrame = 1
        }
        occupied.add(`${mover.gx},${mover.gy}`)
        mover.wanderLeft -= 1
        if (mover.wanderLeft <= 0) mover.phase = 'seek'
      }
      // Still decrement idle partner's wander clock slowly
      const other = mover === a ? b : a
      if (other.phase === 'wander' && other.wanderLeft > 0 && Math.random() < 0.35) {
        other.wanderLeft -= 1
        if (other.wanderLeft <= 0) other.phase = 'seek'
      }
      continue
    }

    // Seek: only one partner steps per tick (staggered by pair + tick)
    const moverSlot = ((tick + a.pairId) % 2) as 0 | 1
    const self = a.pairSlot === moverSlot ? a : b
    const other = self === a ? b : a
    if (self.phase !== 'seek') continue

    const key = `${self.gx},${self.gy}`
    occupied.delete(key)
    const target = sideMeetTarget(self, other)
    const step = stepToward(self, target, occupied, key)
    if (step) {
      self.gx = step.gx
      self.gy = step.gy
      self.facing = step.dir
      self.walkFrame = 1
    } else {
      self.facing = faceToward(self, other)
    }
    occupied.add(`${self.gx},${self.gy}`)
  }

  return next
}

/**
 * Pixel people who pair up side-by-side, face each other, and talk.
 * Includes men and women looks; slow grid stroll.
 */
export default function PixelWanderers({ count = 6 }: { count?: number }) {
  const dialogues = useMemo(() => shuffle([...DIALOGUES]), [])
  const [agents, setAgents] = useState(() => makeAgents(count))
  const tickRef = useRef(0)

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    const id = window.setInterval(() => {
      tickRef.current += 1
      const t = tickRef.current
      setAgents((prev) => tickAgents(prev, dialogues, t))
    }, STEP_MS)
    return () => clearInterval(id)
  }, [dialogues])

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '48vh',
        zIndex: 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {agents.map((agent) => {
        const leftPct = ((agent.gx + 0.5) / GRID_COLS) * 100
        const bottomPct = 4 + (agent.gy / Math.max(1, GRID_ROWS - 1)) * 32
        // Stagger easing so pairs don’t slide in perfect sync
        const delayMs = (agent.pairId * 90 + agent.pairSlot * 140) % 280
        return (
          <div
            key={agent.id}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              bottom: `${bottomPct}%`,
              transform: 'translateX(-50%)',
              zIndex: 2 + agent.gy,
              pointerEvents: 'none',
              transition: `left ${STEP_MS}ms linear ${delayMs}ms, bottom ${STEP_MS}ms linear ${delayMs}ms`,
            }}
          >
            {agent.bubble && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 4,
                  padding: '3px 6px',
                  background: 'rgba(255,255,255,0.92)',
                  color: '#111',
                  fontFamily: s.font.mono,
                  fontSize: 9,
                  lineHeight: 1.2,
                  whiteSpace: 'nowrap',
                  borderRadius: 0,
                }}
              >
                {agent.bubble}
              </div>
            )}
            <PixelSprite
              look={agent.look}
              walkFrame={agent.walkFrame}
              facing={agent.facing}
            />
          </div>
        )
      })}
    </div>
  )
}
