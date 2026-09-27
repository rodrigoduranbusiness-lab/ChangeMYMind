# Switching to xAI Grok

The app supports two AI backends via **`AI_PROVIDER`**:

| Value | Judge + takeaways | Live voice debate |
| --- | --- | --- |
| `vertex` (default) | Gemini on Vertex (`JUDGE_MODEL`) | Vertex Live WebSocket |
| `grok` | Grok chat completions (`GROK_JUDGE_MODEL`) | Grok Voice realtime API |

Client build should set **`VITE_AI_PROVIDER`** to the same value as the server so UX matches (optional today — live routing follows the callable response `provider` field).

## 1. xAI credentials

1. Create an API key at [console.x.ai](https://console.x.ai).
2. Store it as a Firebase Functions secret (recommended):

```bash
firebase functions:secrets:set X_AI_API_KEY
```

3. Wire the secret into functions (if not already in `firebase.json` / function opts). For local emulator:

```bash
export XAI_API_KEY=xai-...
```

## 2. Enable Grok in Cloud Functions

Set environment variables on deploy (Firebase console → Functions → Environment, or `firebase functions:config` / params):

| Variable | Example | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | `grok` | Switches judge, takeaways, and live mint |
| `GROK_JUDGE_MODEL` | `grok-4-1-fast-non-reasoning` | Text judge + takeaways |
| `GROK_VOICE_MODEL` | `grok-voice-latest` | Realtime voice |
| `GROK_VOICE` | `eve` | Voice preset (server + `VITE_GROK_VOICE`) |
| `X_AI_API_KEY` | *(secret)* | Required when `AI_PROVIDER=grok` (alias: `XAI_API_KEY`) |

Leave **`AI_PROVIDER` unset** (or `vertex`) to keep the current Gemini/Vertex stack.

## 3. Client env (`.env` / hosting build)

```env
VITE_AI_PROVIDER=grok
VITE_GROK_VOICE=eve
```

Vertex-specific vars (`VITE_LIVE_MODEL`, `VITE_LIVE_VOICE`) are ignored for live when the callable returns `provider: "grok"`.

## 4. Architecture map

```
Browser                    Cloud Functions                 xAI / Google
───────                    ─────────────────               ────────────
mintLiveAccess      →      live/index.ts                   Vertex SA token OR
                           ├─ vertexAccess                  POST /v1/realtime/client_secrets
                           └─ grokAccess

connectLiveVoiceSession
├─ VertexLiveSession       (unchanged BidiGenerateContent)
└─ GrokLiveSession         wss://api.x.ai/v1/realtime

finalizeSession     →      llm/index.ts
                           ├─ vertexJudge (Gemini JSON schema)
                           └─ grokJudge   (OpenAI-compatible JSON)
```

Code entry points:

- `functions/src/config.ts` — provider + model names
- `functions/src/llm/` — judge and takeaways
- `functions/src/live/` — ephemeral live credentials
- `src/lib/connectLive.ts` — browser live session factory
- `src/lib/grokLive.ts` — Grok Voice WebSocket adapter

## 5. Rollout checklist

- [ ] Set `XAI_API_KEY` secret in production
- [ ] Set `AI_PROVIDER=grok` on all functions that call `llm/` or `live/`
- [ ] Deploy functions + hosting
- [ ] Run one full debate: mic, turn-taking, results, transcript in Firestore
- [ ] Compare judge latency and JSON validity vs Vertex
- [ ] Monitor xAI usage / rate limits (concurrent voice sessions)

## 6. Rollback

Set `AI_PROVIDER=vertex` (or remove it) and redeploy functions. No client change required if live credentials come from the callable.

## 7. Known differences

- Grok judge uses `response_format: json_object` + schema in the system prompt; Vertex uses native JSON schema.
- Grok live uses OpenAI-style realtime events; `GrokLiveSession` maps them to the existing `serverContent` shape.
- Grok Voice cluster is **us-east-1**; Vertex Live uses `VERTEX_LOCATION` (default `us-central1`).
