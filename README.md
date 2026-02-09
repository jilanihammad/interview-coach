# Interview Coach

Interview Coach is a voice-first mock interview app for tech candidates.

## Current Scaffold
- `/setup` — role/company/JD intake + interview mode
- `/session` — live interview session with browser/server voice toggle
- `/feedback` — structured scorecard page
- API routes for sessions, messages, scores, assistant turn, and scorecard generation
- Server voice endpoints:
  - `POST /api/interview/sessions/:id/stt` (provider-selectable STT: Deepgram, OpenAI, or local Whisper CLI)
  - `POST /api/interview/sessions/:id/tts` (provider-selectable TTS: ElevenLabs or OpenAI)
  - `GET /api/interview/voice` (provider capability check)
- Interviewer + evaluator LLM provider support:
  - OpenAI (ChatGPT models)
  - xAI (Grok)
  - Google (Gemini)
  - Deterministic engine remains as fallback if providers fail/unavailable
- SQLite-backed storage via `better-sqlite3`

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/setup`.

If provider API keys are missing, the app automatically falls back:
- Voice: browser capture/speech synthesis mode
- Interview turns + scorecard: deterministic engine/scoring

## Notes
This repo was split out from Launcher so Launcher can stay focused on startup launch workflows.
