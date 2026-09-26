import * as s from '../theme'

type Row = { word: string; count: number }

/**
 * Horizontal bar chart for filler-word counts — white bars on black, no cards.
 */
export default function FillerChart({ rows }: { rows: Row[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1)

  return (
    <div
      role="img"
      aria-label={rows.map((r) => `${r.word}: ${r.count}`).join(', ')}
      style={{ marginTop: 8 }}
    >
      {rows.map((row) => {
        const pct = Math.round((row.count / max) * 100)
        return (
          <div key={row.word} style={{ marginBottom: 14 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 6,
                fontSize: 14,
                fontFamily: s.font.serif,
              }}
            >
              <span style={{ color: s.color.text }}>{row.word}</span>
              <span
                style={{
                  color: s.color.textMuted,
                  fontFamily: s.font.mono,
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.count}
              </span>
            </div>
            <div
              style={{
                height: 8,
                width: '100%',
                background: 'rgba(255,255,255,0.08)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: s.color.text,
                  transition: 'width 500ms ease',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
