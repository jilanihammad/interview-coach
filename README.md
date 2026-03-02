# Interview Coach

Real-time voice pipeline for conversational AI, built as a mock interview app.

The hard problem isn't interview prep. It's engineering a low-latency voice loop: capture speech, reason about it, and speak back fast enough that the conversation feels natural. This project is a working implementation of that pipeline.

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

**Voice capture:** Browser `MediaRecorder` captures audio, sends to `/api/interview/sessions/:id/stt` for server-side transcription. Falls back to Web Speech API if server STT is unavailable.

**Turn generation:** A deterministic state machine (`engine.ts`) decides turn type (kickoff, question, follow-up, wrap-up) based on session state, time/question budgets, and answer quality heuristics. The LLM rewrites for natural phrasing, but the state machine controls conversation flow.

**Speech output:** Assistant text hits `/api/interview/sessions/:id/tts`, returns audio streamed to an `<audio>` element. Falls back to browser `speechSynthesis`.

**Fallback chain:** Every layer degrades gracefully. No API keys? Browser voice + deterministic engine. LLM down? Engine handles turn logic alone. Server TTS fails? Client auto-switches to browser synthesis with a UI notice.

## Why It's Fast

The LLM isn't driving conversation structure. The deterministic state machine computes the next turn type in microseconds. The LLM only rewrites for phrasing (capped at 320 tokens, 30s timeout). If the LLM is slow or fails, the deterministic turn ships immediately. Worst-case latency is STT time + TTS time. The LLM is never on the critical path.

## Architecture

| Layer | Tech | Role |
|-------|------|------|
| Frontend | Next.js 16, React 19 | Session UI, voice controls, transcript |
| Voice | OpenAI Whisper / TTS, Deepgram, ElevenLabs | Server-side STT + TTS with provider chains |
| Reasoning | GPT-4.1-mini + deterministic engine | Turn generation, scorecard evaluation |
| State | SQLite (WAL mode) | Sessions, messages, scores, provider telemetry |
| Testing | Vitest + Playwright | 36 tests: unit, integration, e2e |

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
