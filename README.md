# Interview Coach

Interview Coach is a voice-first mock interview app for tech candidates.

## Current Scaffold
- `/setup` — role/company/JD intake + interview mode
- `/session` — live interview session skeleton
- `/feedback` — structured scorecard page
- API routes for sessions, messages, and scores
- SQLite-backed storage via `better-sqlite3`

## Run locally
```bash
npm install
npm run dev
```

Open `http://localhost:3000/setup`.

## Notes
This repo was split out from Launcher so Launcher can stay focused on startup launch workflows.
