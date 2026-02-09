# Interview Coach

Interview Coach is a voice-first mock interview app for tech candidates.

## Current Scaffold
- `/setup` — role/company/JD intake + interview mode
- `/session` — live interview session with browser/server voice toggle
- `/feedback` — structured scorecard page
- API routes for sessions, messages, scores, assistant turn, and scorecard generation
- Server voice endpoints:
  - `POST /api/interview/sessions/:id/stt` (Deepgram prerecorded STT)
  - `POST /api/interview/sessions/:id/tts` (ElevenLabs TTS)
  - `GET /api/interview/voice` (provider capability check)
- SQLite-backed storage via `better-sqlite3`

## Run locally
```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/setup`.

If provider API keys are missing, the app automatically uses browser voice mode.

## Notes
This repo was split out from Launcher so Launcher can stay focused on startup launch workflows.
