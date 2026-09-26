# Common Ground

A voice debate app for reducing political polarization. You answer ten
questions, get routed to the topic you hold most strongly, then spend six
minutes talking out loud with an AI that argues the opposite side. An impartial
judge scores how you argued — not whether it agrees with you — and the results
screen plots how polarized you actually are.

## How it works

1. **Sign in** with a phone number (Firebase Auth, invisible reCAPTCHA).
2. **Diagnostic** — ten 1–5 agree/disagree statements. Two per topic, phrased in
   opposite directions so answering "agree" to everything reads as centrist,
   plus two openness questions. You are routed to the topic with the highest
   extremity.
3. **Debate** — six minutes of real-time voice with Gemini Live. The AI argues
   the opposite of your lean. After every exchange the full transcript goes to a
   judge running in a Cloud Function. You see the clock and who is speaking, and
   nothing else.
4. **Results** — a circular spectrum (center = open-minded, edge = polarized),
   the win/lose outcome, the per-criterion breakdown, and two or three
   plain-language takeaways.

**Win** if persuasion reaches 80 before time is up. **Lose** if the clock runs
out, or if civility drops to 2 or below on two consecutive evaluations.

## Models

Chosen from the current Google docs, verified against the installed SDKs:

| Role | Model | How it is called |
| --- | --- | --- |
| Voice debater | `gemini-3.1-flash-live-preview` | Firebase AI Logic (`getLiveGenerativeModel`) from the browser |
| Judge + takeaways | `gemini-3.8-flash` | `@google/genai` inside a Cloud Function |

Both are overridable — `VITE_LIVE_MODEL` and the `JUDGE_MODEL` env var on the
function. For Gemini 2.5 native audio instead, set `VITE_LIVE_MODEL` to
`gemini-2.5-flash-native-audio-preview-12-2025`.

### No API key reaches the browser

The web client talks to the Live API through **Firebase AI Logic**, which
authorizes the request with the Firebase app identity plus App Check. There is
no Gemini API key in the bundle and no ephemeral-token endpoint to maintain.

The judge's key is a Secret Manager secret (`GEMINI_API_KEY`) read only inside
the Cloud Function.

> The debater's system prompt *is* in the client bundle, because the Live API
> takes the system instruction from whoever opens the socket. That is inherent
> to client-side Live sessions. The prompt is written to withstand being read:
> it treats "ignore your instructions" and friends as conversation, not
> commands, and the win condition is decided server-side regardless.

## Setup

### 1. Firebase project

```bash
npm install
npm --prefix functions install
firebase login
firebase use --add          # replaces the placeholder in .firebaserc
```

In the Firebase console:

- **Authentication** → enable the **Phone** provider.
- **Firestore** → create a database.
- **Firebase AI Logic** → enable it and pick the **Gemini Developer API**
  backend.
- **App Check** (recommended) → register a reCAPTCHA Enterprise site key and
  enforce it on Firebase AI Logic.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the web app config from **Project settings → Your apps**. These values
are public by design; access is controlled by Firestore rules and App Check.

### 3. Judge API key

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### 4. Test phone numbers for local dev

Phone auth costs money and rate-limits, so use fixed test numbers. In the
console under **Authentication → Sign-in method → Phone → Phone numbers for
testing**, add:

| Phone number | Code |
| --- | --- |
| `+1 555 555 0100` | `123456` |
| `+1 555 555 0101` | `654321` |

These sign in without sending an SMS and without a reCAPTCHA challenge, in both
the emulator and a deployed build. With `VITE_USE_EMULATORS=true` the client
also sets `appVerificationDisabledForTesting`, so no reCAPTCHA is involved at
all locally.

## Running it

```bash
npm run dev            # Vite dev server
npm run emulators      # Auth + Firestore + Functions emulators
```

Set `VITE_USE_EMULATORS=true` in `.env.local` to point the client at the
emulators.

The Live API is **not** emulated — voice debates always hit the real Gemini
service, so the Firebase project needs AI Logic enabled even in local dev.

## Tuning the prompts

Both system prompts are standalone files, meant to be read and edited by
humans:

```
prompts/debater.md     the voice debater
prompts/judge.md       the scoring rubric
prompts/takeaways.md   the end-of-debate feedback
```

Each file starts with notes for whoever is tuning it, then a `---` line.
**Only the text after `---` is sent to the model**, so you can annotate freely.
Placeholders like `{{TOPIC_LABEL}}` are filled from `shared/topics.ts` at
runtime; an unfilled placeholder throws rather than shipping to the model.

`scripts/sync-shared.mjs` mirrors `prompts/` and `shared/` into
`functions/src/` on every build, since Cloud Functions can only deploy files
inside `functions/`. Edit the originals — the copies are generated and
gitignored.

### Neutrality

The requirement is that the debater argues both sides equally well and the
judge scores identically regardless of the user's side. Three things enforce it:

- Both prompts are written entirely in terms of "your position" and "their
  position", never in terms of specific politics. Each side's position
  statement comes from one place (`shared/topics.ts`) and both are written to
  the same length and strength.
- `npm test` includes structural guards: both sides of every topic must be
  stated at comparable length, and the rendered debater prompt must be the same
  size for either side.
- `npm run judge:harness` includes a **neutrality check** that scores two
  structurally identical arguments made from opposite sides of the same topic
  and reports the per-criterion gap. A large gap means the rubric is leaking a
  preference.

## Judge test harness

The judge runs text-only, so it can be exercised without audio or Firestore:

```bash
GEMINI_API_KEY=... npm run judge:harness                  # all fixtures + neutrality check
GEMINI_API_KEY=... npm run judge:harness -- strong_case    # one fixture
GEMINI_API_KEY=... npm run judge:harness -- --file t.txt --topic guns --debater right
```

Fixtures in `functions/src/fixtures.ts` cover a weak case, an assertion-only
case, a strong case, hostility, prompt injection, and flattery, each with
loose assertions about what a correct judge should do. A transcript file is
plain lines of `USER: …` and `AI: …`.

## Tests

```bash
npm test               # scoring, routing, win/lose rules, prompt guards (53 tests)
npm run test:rules     # Firestore security rules against the emulator (17 tests)
```

## Security model

- **Firestore rules** let a user read and write only their own profile and
  diagnostic answers, and only read their own sessions. The client cannot write
  to a session document at all.
- **Everything that decides the outcome** — `startedAt`, the transcript,
  `judgeEvals`, `status`, `results` — is written only by Cloud Functions through
  the Admin SDK. A user cannot fabricate a win by writing to Firestore.
- **The timer is server-side.** `startedAt` is stamped from the server clock and
  the deadline is recomputed on every call. A turn submitted after the deadline
  is recorded as a loss, never judged into a win.
- **Scores never reach the client mid-debate.** `submitTurn` returns only
  `continue` / `won` / `lost`, so the UI has nothing to leak.
- **Gaming cannot win.** If the judge flags a manipulation attempt, persuasion
  is capped below the win threshold before the decision is made
  (`shared/rules.ts`), independent of what the judge returned.
- **Pause credit is capped** at 60s total, so a dropped connection cannot be
  used to stretch the six minutes.

## Deploying

```bash
npm run deploy         # builds, then firebase deploy
```

Or piecemeal:

```bash
firebase deploy --only firestore:rules
firebase deploy --only functions
npm run build && firebase deploy --only hosting
```

## Layout

```
prompts/              debater, judge, and takeaways prompts (editable)
shared/               logic used by both the client and the functions
  diagnostic.ts         questions, scoring, topic routing
  scoring.ts            polarization math and thresholds
  rules.ts              win/lose decision
  topics.ts             the four topics and both sides of each
src/
  pages/                SignIn, Diagnostic, Debate, Results
  lib/liveDebate.ts     Gemini Live session, transcription, turn detection
  lib/audio.ts          mic capture at 16kHz, playback at 24kHz
  components/Spectrum.tsx   the circular SVG spectrum
functions/src/
  sessions.ts           startSession, submitTurn, finalizeSession, abandonSession
  gemini.ts             judge and takeaways calls
  harness.ts            text-only judge harness
tests/                logic tests; tests/emulator holds the rules tests
```

### A note on the audio pipeline

The Firebase SDK ships `startAudioConversation`, which handles mic and playback
for you — but it takes sole ownership of `session.receive()` and discards the
transcription messages. The transcript is the input to the judge, so
`src/lib/audio.ts` runs its own capture and playback and `liveDebate.ts` reads
the message stream directly.

## Styling

All component styling is inline style objects. Shared tokens and element styles
live in `src/theme.ts`. `src/index.css` holds only what inline styles cannot
express: the document reset and `@keyframes`.
