# Interview Coach

Real-time voice pipeline for conversational AI — built as a mock interview app.

The hard problem isn't interview prep (the market has plenty). It's engineering a low-latency voice loop: capture speech, reason about it, and speak back — fast enough that the conversation feels natural. This project is a working implementation of that pipeline.

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Speech-to-  │────▶│  LLM Engine  │────▶│  Text-to-   │
│  Text (STT)  │     │  (Reasoning) │     │  Speech(TTS)│
└─────────────┘     └──────────────┘     └─────────────┘
  OpenAI Whisper      GPT-4.1-mini        OpenAI TTS
  ↕ fallback          ↕ fallback          ↕ fallback
  Deepgram            xAI / Gemini        ElevenLabs
  local Whisper CLI   deterministic       browser synth
                      engine
```

**Voice capture** → Browser `MediaRecorder` captures audio, sends to `/api/interview/sessions/:id/stt` for server-side transcription. Falls back to Web Speech API if server STT is unavailable.

**Turn generation** → A deterministic state machine (`engine.ts`) decides turn type (kickoff, question, follow-up, wrap-up) based on session state, time/question budgets, and answer quality heuristics. The LLM rewrites the turn for natural phrasing — but the state machine is always the source of truth for conversation flow.

**Speech output** → Assistant text hits `/api/interview/sessions/:id/tts`, returns audio streamed to an `<audio>` element. Falls back to browser `speechSynthesis`.

**Fallback chain** → Every layer has degraded-mode behavior. No API keys? Browser voice + deterministic engine. LLM down? Engine handles turn logic alone. Server TTS fails mid-session? Client auto-switches to browser synthesis with a UI notice.

## Architecture

| Layer | Tech | Role |
|-------|------|------|
| Frontend | Next.js 16, React 19 | Session UI, voice controls, transcript |
| Voice | OpenAI Whisper / TTS, Deepgram, ElevenLabs | Server-side STT + TTS with provider chains |
| Reasoning | GPT-4.1-mini + deterministic engine | Turn generation, scorecard evaluation |
| State | SQLite (WAL mode) | Sessions, messages, scores, provider telemetry |
| Testing | Vitest + Playwright | 36 tests: unit, integration, e2e |

## Product Decisions & Tradeoffs

**Why OpenAI for all three components (STT/LLM/TTS)?**
Single vendor reduces integration surface and latency variance. When STT, reasoning, and TTS all hit the same provider, you eliminate cross-vendor auth, billing, and format translation overhead. The tradeoff: you're coupled to one provider's uptime. The fallback chains (Deepgram for STT, ElevenLabs for TTS, xAI/Gemini for LLM) are the mitigation — configured via env vars, no code changes.

**How does the voice loop stay fast?**
The LLM isn't driving conversation structure — a deterministic state machine is. The engine computes the next turn type and content in microseconds. The LLM only rewrites for natural phrasing (capped at 320 tokens, 30s timeout). If the LLM is slow or fails, the deterministic turn ships immediately. This means worst-case latency is STT time + TTS time — the LLM is never on the critical path.

**How does turn-taking work?**
Explicit, not automatic. The user clicks "Start speak" / "Stop speak" rather than relying on voice activity detection (VAD). This is a deliberate UX choice: VAD in browser environments is unreliable (background noise, mic sensitivity variance), and false triggers in a mock interview break the experience worse than a button press. Server-side, the `MediaRecorder` captures a complete utterance and sends it as one blob for transcription.

**Why not WebRTC or a voice AI platform (Vapi, LiveKit, etc.)?**
WebRTC solves real-time bidirectional audio streaming — but this app doesn't need persistent audio channels. Each turn is a discrete request-response: record → transcribe → reason → synthesize → play. HTTP endpoints are simpler to deploy, test, and debug than WebRTC signaling. A dedicated voice platform would abstract the pipeline away — and the pipeline *is* the interesting part.

## Run Locally

```bash
npm install
cp .env.example .env.local   # add OPENAI_API_KEY at minimum
npm run dev                   # http://localhost:3000/setup
```

Works without API keys in degraded mode (browser voice + deterministic engine).

```bash
npm test              # unit + integration (Vitest)
npm run test:e2e      # smoke tests (Playwright)
```

## Stack

TypeScript · Next.js 16 · React 19 · SQLite · OpenAI (Whisper + GPT-4.1-mini + TTS) · Vitest · Playwright
