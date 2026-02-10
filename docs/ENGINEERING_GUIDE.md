# Interview Coach — Engineering Guide

This document is the main onboarding + architecture reference for engineers working on `interview-coach`.

It covers:
- first-time local setup (exact run steps)
- runtime architecture (frontend, API, engine, voice, persistence)
- code-level contribution guide
- rollout hardening checklist (including pre-public blockers)

---

## 1) What this app is (and is not)

Interview Coach is a dedicated mock-interview web app (split from Launcher) with:
- setup flow (`/setup`)
- live session flow (`/session?id=...`)
- feedback flow (`/feedback?id=...`)

Core behavior:
- deterministic interview engine always exists as a fallback
- provider-backed LLM/STT/TTS improve realism when configured
- explicit turn-taking UX: **Start speak / Stop speak / Send**

Important boundary:
- Launcher-oriented product-generation endpoints still exist in this repo (`/api/products`, `/api/generate/*`, etc.) from prior lineage, but they are not part of the core Interview Coach journey.

---

## 2) First-time run (exact steps)

## 2.1 Prerequisites

- Node.js 20+ (project currently runs on newer Node as well)
- npm
- macOS/Linux/Windows supported for app runtime
- Optional for local Whisper fallback: `whisper` CLI installed and reachable on PATH

## 2.2 Install and configure

From repo root:

```bash
npm install
cp .env.example .env.local
```

For best default behavior (OpenAI-first stack), set at least:

```bash
OPENAI_API_KEY=...
```

You can leave everything else at `.env.example` defaults for first run.

## 2.3 Start app

```bash
npm run dev
```

Open:
- `http://localhost:3000/setup`

## 2.4 First manual smoke test (recommended)

1. On `/setup`, fill:
   - target company
   - role title
   - job description
   - choose mode (time or question-count)
2. Check consent checkbox.
3. Click **Start interview**.
4. On session page:
   - click **Start** (assistant kickoff)
   - type or speak an answer
   - click **Send**
5. Click **End and score**.
6. Verify feedback page loads scorecards + summary.
7. Click **Delete session data** and confirm redirect to setup.

## 2.5 Health check behavior

`GET /api/health` returns 200 only when all are true:
- DB ping succeeds
- LLM provider is configured
- server STT and server TTS are available

If you run with no API keys, app still works in fallback mode, but health may return 503 by design.

---

## 3) Project structure (high signal)

- `app/setup/page.tsx` — session intake + consent + mode config
- `app/session/SessionClient.tsx` — transcript UI, voice controls, send loop
- `app/feedback/FeedbackClient.tsx` — scorecard view + delete session

- `app/api/interview/sessions/route.ts` — create/list sessions, retention trigger, input sanitization, rate limit
- `app/api/interview/sessions/[id]/route.ts` — get/update/delete session bundle
- `app/api/interview/sessions/[id]/assistant-turn/route.ts` — candidate turn handling, next assistant turn generation
- `app/api/interview/sessions/[id]/scorecard/route.ts` — score generation + summary
- `app/api/interview/sessions/[id]/stt/route.ts` — speech-to-text
- `app/api/interview/sessions/[id]/tts/route.ts` — text-to-speech
- `app/api/interview/voice/route.ts` — server voice capability contract
- `app/api/health/route.ts` — readiness endpoint

- `lib/db.ts` — SQLite schema + all persistence helpers
- `lib/interview/engine.ts` — deterministic interview state/turn logic
- `lib/interview/llm.ts` — LLM provider chain + evaluator/interviewer generation
- `lib/interview/server-voice.ts` — STT/TTS providers + capability resolution
- `lib/interview/prompts.ts` — interviewer/evaluator system prompts and guardrails
- `lib/interview/rate-limit.ts` — in-memory rate limiter
- `lib/interview/observability.ts` — structured log helper

- `tests/unit/*` — deterministic engine/prompt tests
- `tests/integration/*` — route tests
- `tests/e2e/smoke.spec.ts` — setup page smoke
- `docs/QA_MATRIX.md` — prioritized QA matrix

---

## 4) End-to-end architecture

## 4.1 User flow

1. **Setup (`/setup`)**
   - client validates required fields + consent
   - POST `/api/interview/sessions`
   - server sanitizes and validates payload
   - session persisted in SQLite

2. **Session (`/session?id=...`)**
   - client loads bundle via `GET /api/interview/sessions/:id`
   - start button triggers `POST /assistant-turn` without candidate answer for kickoff
   - candidate answers are sent through `POST /assistant-turn` (typed or STT-produced)
   - assistant response generated from deterministic engine + optional LLM refinement

3. **Voice path**
   - `GET /api/interview/voice` detects server capability
   - browser mode uses Web Speech APIs
   - server mode uses `/stt` + `/tts`
   - client auto-falls back to browser mode on server voice failure

4. **Feedback (`/feedback?id=...`)**
   - POST `/scorecard`
   - route computes or reuses scores
   - marks session done/completed
   - renders strengths/gaps/frameworks/focus areas/stats

5. **Deletion**
   - `DELETE /api/interview/sessions/:id`
   - cascades delete messages/scores; provider usage keeps NULL sessionId by FK behavior

## 4.2 Control-plane behavior

- **State machine authority**: deterministic engine (`nextAssistantTurn`) decides turn kind (`kickoff`, `question`, `follow_up`, `wrap_up`)
- **LLM is enhancer, not source of truth**: LLM can rewrite turn text but not state transitions
- **Scorecards are idempotent**: if scores already exist, route reuses them
- **Route locks**: in-flight sets prevent concurrent double-processing per session in a single process

---

## 5) Data model and persistence

SQLite database lives at:
- `data/launcher.db`

(Yes, filename still says `launcher.db`; this is a known naming debt after repo split.)

Main tables in `lib/db.ts`:
- `interview_sessions`
- `interview_messages`
- `interview_scores`
- `interview_provider_usage`
- (plus legacy `products` table)

Important DB choices:
- WAL mode enabled
- busy timeout set (5000 ms)
- foreign keys enabled
- interview message/score rows cascade on session delete

Session-level fields worth knowing:
- `status`: `draft | in_progress | completed | cancelled`
- `phase`: `setup | intro | question | follow_up | wrap_up | scoring | done`
- consent tracking: `consentAcceptedAt`, `consentVersion`
- mode and budget fields (`time` or `question_count`)

---

## 6) Interview engine behavior (deterministic core)

Defined in `lib/interview/engine.ts`.

Key logic:
- custom question bank (if provided) overrides default bank
- follow-up budget is dynamic (usually 3-5) based on:
  - mode
  - remaining time / remaining core questions
  - answer quality heuristics (thin answer / lacks metrics)
- wrap-up trigger depends on mode and elapsed progress
- kickoff prompt is generated from session context and personality

This deterministic engine is the resilience layer when LLM is down or malformed.

---

## 7) LLM architecture

`lib/interview/llm.ts` provides two generation paths:
- interviewer turn rewriting (`generateInterviewerTurnWithLlm`)
- evaluator scorecard generation (`generateEvaluatorScorecardWithLlm`)

Provider chain behavior:
- providers: `openai`, `xai`, `google`
- primary from `INTERVIEW_LLM_PROVIDER` (or inferred from available keys)
- optional ordered fallbacks from `INTERVIEW_LLM_FALLBACKS`
- first successful provider wins; latency/attempt metadata returned

Safety and shape controls:
- prompt states user fields/transcript are untrusted
- evaluator must return strict JSON
- parsing normalizes and validates all required dimensions
- malformed output throws and deterministic fallback is used

---

## 8) Voice architecture (browser + server fallback)

## 8.1 Browser voice

In `lib/interview/browser-voice.ts`:
- STT: Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
- TTS: `speechSynthesis`

## 8.2 Server voice

In `lib/interview/server-voice.ts`:

STT providers:
- OpenAI (`/audio/transcriptions`)
- Deepgram
- Whisper CLI

TTS providers:
- OpenAI (`/audio/speech`)
- ElevenLabs

Resolution policy:
- OpenAI-first defaults
- provider availability depends on keys/binaries
- STT supports fallback chain (`INTERVIEW_STT_FALLBACKS`)
- TTS currently resolves one active provider (no multi-hop retries)

Client behavior in `SessionClient`:
- user can select browser or server voice
- if server mode fails, UI shows notice and switches to browser voice

---

## 9) API behavior and protections

## 9.1 Input limits currently enforced

Session creation:
- target company <= 120 chars
- role title <= 120 chars
- role level <= 80 chars
- job description <= 10,000 chars
- custom questions <= 5,000 chars

Assistant-turn:
- max candidate turns per session (default 25)
- max session duration (default 90 min)
- in-flight lock per session
- terminal/scoring phase rejection

STT:
- audio required
- max upload size default 5 MB
- mapped error statuses for no speech / timeout / invalid codec / missing provider

## 9.2 Rate limiting

In-memory rate limiter (`Map`) in `lib/interview/rate-limit.ts`.

Applied on:
- session create
- assistant turn
- scorecard
- stt
- tts

Important operational caveat:
- limits are per-process memory only (not shared across replicas)
- process restart clears limiter state

## 9.3 Retention and deletion

- retention purge uses `INTERVIEW_RETENTION_DAYS` (default 7)
- purge check runs on session list/create routes (hourly throttle)
- explicit user deletion is available from feedback UI (`DELETE /sessions/:id`)

---

## 10) Observability and operations

## 10.1 Logging

`logInterviewEvent(level, event, data)` writes JSON logs with:
- timestamp
- scope (`interview`)
- event name
- attached metadata (sessionId/provider/fallback/etc.)

## 10.2 Provider usage telemetry

Each LLM/STT/TTS call can write records to `interview_provider_usage`:
- provider
- model
- latency
- fallback-used flag
- success/failure
- optional error text

## 10.3 Health endpoint

`GET /api/health` reports:
- db health
- llm configured
- voice capabilities
- aggregate `healthy` boolean

---

## 11) Testing strategy

Commands:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run test:e2e
npm run build
```

Current strategy:
- unit tests: deterministic logic and prompt wiring
- integration tests: API route behavior and status mapping
- e2e smoke: setup page render contract
- manual checklist: `docs/QA_MATRIX.md`

When changing core turn/voice/score logic:
- add/adjust integration tests for route behavior
- add unit tests for deterministic engine changes
- update QA matrix if manual scenarios change

---

## 12) New engineer contribution guide

## 12.1 Branching and scope hygiene

- Keep interview flow changes isolated from legacy product-generation endpoints unless explicitly requested.
- Prefer small vertical slices: route + tests + docs in same PR.

## 12.2 Where to make common changes

- Add interview setup fields: `app/setup/page.tsx` + `app/api/interview/sessions/route.ts` + `lib/interview/types.ts` + DB schema if persisted
- Change turn-taking behavior: `lib/interview/engine.ts` (+ unit tests)
- Change LLM prompt/persona: `lib/interview/prompts.ts`
- Change provider behavior: `lib/interview/llm.ts` / `lib/interview/server-voice.ts`
- Change score output UI: `app/feedback/FeedbackClient.tsx`

## 12.3 Known gotchas

- DB filename is `launcher.db` despite repo being interview-coach.
- Package name in `package.json` is still `launcher-app`.
- In-flight lock sets and rate limits are in-memory only.
- Health endpoint can read unhealthy even while fallback mode remains usable.
- `x-forwarded-for` trust is naive today (first value wins).

---

## 13) Environment variables (engineer-facing)

### Core provider config (in `.env.example`)
- `OPENAI_API_KEY`
- `INTERVIEW_LLM_PROVIDER`, `INTERVIEW_LLM_FALLBACKS`, model vars
- `INTERVIEW_STT_PROVIDER`, `INTERVIEW_STT_FALLBACKS`
- `INTERVIEW_TTS_PROVIDER`
- optional provider-specific vars for Deepgram/xAI/Google/ElevenLabs/Whisper

### Hardening/runtime knobs (not all listed in `.env.example` yet)
- `INTERVIEW_CONSENT_VERSION`
- `INTERVIEW_RETENTION_DAYS`
- `INTERVIEW_RATE_SESSION_CREATE`, `INTERVIEW_RATE_SESSION_CREATE_WINDOW_MS`
- `INTERVIEW_RATE_TURNS`, `INTERVIEW_RATE_TURNS_WINDOW_MS`
- `INTERVIEW_RATE_SCORECARD`, `INTERVIEW_RATE_SCORECARD_WINDOW_MS`
- `INTERVIEW_RATE_STT`, `INTERVIEW_RATE_STT_WINDOW_MS`
- `INTERVIEW_RATE_TTS`, `INTERVIEW_RATE_TTS_WINDOW_MS`
- `INTERVIEW_MAX_CANDIDATE_TURNS`
- `INTERVIEW_MAX_SESSION_DURATION_MIN`
- `INTERVIEW_MAX_AUDIO_BYTES`

---

## 14) Before public rollout: required enhancements

This is the most important section for release planning.

## 14.1 Must-complete blockers (pre-public)

1. **Add API auth gate for `/api/interview/*`**
   - minimum viable: shared bearer token or signed access token check
   - enforce on all mutating + sensitive read routes
   - include clear local-dev bypass only in development mode

2. **Add `candidateAnswer` max length validation in assistant-turn route**
   - defend against token abuse / accidental huge payloads
   - return 400 with clear error

3. **Add TTS `text` max length validation in TTS route**
   - cap synthesis payload size/cost
   - return 400 with clear error

These three are the current hard blockers for broad/public exposure.

## 14.2 Strongly recommended before open beta

4. Move rate limiting to shared backend (Redis/upstash/etc.) for multi-instance correctness.
5. Harden IP extraction/trust model (`x-forwarded-for` only behind trusted proxy).
6. Add auth-aware abuse controls (per-account quotas, anomaly detection, CAPTCHA on session creation if public web).
7. Add richer observability export (metrics/traces to external sink, not only stdout JSON logs).
8. Add explicit error budget / SLOs for STT, TTS, and assistant-turn latency.
9. Run full QA matrix on Safari/iOS and real mobile devices before opening traffic.

## 14.3 Recommended before GA

10. Add explicit privacy policy / legal consent text revisioning workflow.
11. Add configurable PII minimization/redaction for stored transcripts.
12. Add data export endpoint and auditable delete logs.
13. Add production security headers/CSP in `next.config.ts`.
14. Resolve naming debt (`launcher.db`, `launcher-app`) for clarity.

---

## 15) Quick architecture map (one-screen mental model)

- **UI pages**: setup → session → feedback
- **Session API**: create/read/update/delete + assistant-turn + scorecard
- **Engine**: deterministic state/turn logic (source of truth)
- **LLM layer**: optional enhancement/fallback chain for turn phrasing + scoring
- **Voice layer**: browser APIs and/or server STT/TTS providers
- **DB**: SQLite with sessions/messages/scores/provider usage
- **Hardening**: consent, rate limits, retention, logging, health, deletion

If you understand those seven bullets, you can navigate and modify the system safely.

---

## 16) Immediate next engineering tasks

If you are picking up work now, start here:

1. Implement API auth gate for `/api/interview/*`.
2. Add `candidateAnswer` length cap in assistant-turn route + integration tests.
3. Add TTS input length cap + integration tests.
4. Re-run full validation suite.
5. Run one final architecture sanity pass, then proceed with controlled external pilot.

---

Owner note:
- This guide should be updated whenever interview flow contracts, provider strategy, or rollout readiness status changes.
