import * as s from './theme'

/**
 * Shown instead of the app when the Firebase web config is missing. Without
 * this, `getAuth` throws during module initialization and the user just gets a
 * blank page with a stack trace in the console.
 */
export default function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div style={s.page}>
      <div style={{ ...s.card, maxWidth: 560 }}>
        <span style={s.label}>Configuration needed</span>
        <h1 style={s.heading}>Common Ground is not configured yet</h1>
        <p style={{ ...s.subheading, marginTop: 12 }}>
          The Firebase web config is missing, so the app cannot connect to Auth, Firestore, or
          the Gemini Live API. Copy the example environment file and fill it in from your
          Firebase project settings.
        </p>

        <pre
          style={{
            margin: '20px 0 0',
            padding: '14px 16px',
            fontSize: 13,
            fontFamily: s.font.mono,
            color: s.color.text,
            background: s.color.bg,
            border: `1px solid ${s.color.border}`,
            overflowX: 'auto',
          }}
        >
          cp .env.example .env.local
        </pre>

        <div style={{ marginTop: 20 }}>
          <div style={{ ...s.label, marginBottom: 10 }}>Missing variables</div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {missing.map((key) => (
              <li
                key={key}
                style={{ fontSize: 13, fontFamily: s.font.mono, color: s.color.danger }}
              >
                {key}
              </li>
            ))}
          </ul>
        </div>

        <p style={{ ...s.subheading, fontSize: 13, marginTop: 20 }}>
          See <code style={{ fontFamily: s.font.mono }}>README.md</code> for the full setup,
          including enabling the Phone provider and Firebase AI Logic.
        </p>
      </div>
    </div>
  )
}
