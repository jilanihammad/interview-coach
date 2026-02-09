# Interview Coach — Prioritized Executable QA Matrix

Status legend:
- ✅ Implemented automated test
- 🧪 Implemented but manual execution required
- 📝 Tracked manual scenario

## P0 — Ship blockers

| ID | Scenario | Layer | Status | Test file / procedure |
|---|---|---|---|---|
| P0-01 | Invalid state transitions are rejected | Unit | ✅ | `tests/unit/engine.test.ts` |
| P0-02 | Terminal state safety (no illegal transitions) | Unit | ✅ | `tests/unit/engine.test.ts` |
| P0-03 | Follow-up cap enforced in legacy mode (`useTimeBudget=false`) | Unit | ✅ | `tests/unit/engine.test.ts` |
| P0-04 | End condition boundaries (question/time modes) | Unit | ✅ | `tests/unit/engine.test.ts` |
| P0-05 | Session creation validation (required fields/personality) | Integration | ✅ | `tests/integration/sessions-route.test.ts` |
| P0-06 | Assistant-turn rejects missing session | Integration | ✅ | `tests/integration/assistant-turn-route.test.ts` |
| P0-07 | Candidate metadata persisted (`responseDurationSec`,`wordCount`) | Integration | ✅ | `tests/integration/assistant-turn-route.test.ts` |
| P0-08 | Wrap-up transition persists completion state | Integration | ✅ | `tests/integration/assistant-turn-route.test.ts` |
| P0-09 | Scorecard generation with summary output | Integration | ✅ | `tests/integration/scorecard-route.test.ts` |
| P0-10 | Scorecard no-answer path returns safe error | Integration | ✅ | `tests/integration/scorecard-route.test.ts` |
| P0-11 | Scorecard endpoint idempotency | Integration | ✅ | `tests/integration/scorecard-route.test.ts` |
| P0-12 | STT/TTS validation + 503 mapping for unconfigured providers | Integration | ✅ | `tests/integration/voice-routes.test.ts` |

## P1 — Must pass before broad usage

| ID | Scenario | Layer | Status | Test file / procedure |
|---|---|---|---|---|
| P1-01 | Personality prompt wiring + no undefined/null leakage | Unit | ✅ | `tests/unit/prompts.test.ts` |
| P1-02 | Custom question priority over defaults | Unit | ✅ | `tests/unit/engine.test.ts` |
| P1-03 | Time-budget follow-up behavior (3–5 path) | Unit | ✅ | `tests/unit/engine.test.ts` |
| P1-04 | Near-time-expiry wrap behavior | Unit | ✅ | `tests/unit/engine.test.ts` |
| P1-05 | Voice capabilities route contracts | Integration | ✅ | `tests/integration/voice-routes.test.ts` |
| P1-06 | STT empty audio handling | Integration | ✅ | `tests/integration/voice-routes.test.ts` |
| P1-07 | Multi-tab same session consistency | Manual/E2E | 📝 | Open same `/session?id=...` in two tabs; verify no transcript corruption |
| P1-08 | Rapid Start/Stop speak debounce | Manual/E2E | 📝 | Tap Start/Stop rapidly, verify one coherent transcript append |
| P1-09 | Provider outage fallback to browser mode | Manual/E2E | 🧪 | Unset API keys, verify fallback notices + continued session |

## P2 — Hardening and platform reliability

| ID | Scenario | Layer | Status | Test file / procedure |
|---|---|---|---|---|
| P2-01 | Safari MediaRecorder compatibility path | Manual (cross-browser) | 📝 | iOS/macOS Safari smoke run with Start/Stop speak + Send |
| P2-02 | Audio autoplay/voice output reliability | Manual | 📝 | Fresh tab + no prior interaction, verify interviewer voice behavior |
| P2-03 | Large JD/custom question input validation | Integration | ✅ | `tests/integration/sessions-route.test.ts` (validation + payload behavior) |
| P2-04 | Feedback route for in-progress vs missing sessions | Manual/E2E | 📝 | Navigate to `/feedback?id=<active/missing>` and verify distinct UX |
| P2-05 | Background/foreground long session timer consistency | Manual | 📝 | Time-boxed session with tab throttling test |

## Acceptance criteria

### P0 gate
- `npm run test` green
- `npm run lint`, `npx tsc --noEmit`, `npm run build` green
- No unresolved P0 failures

### P1 gate
- All automated P1 tests green
- Manual P1 checklist executed once per release candidate

### P2 gate
- Manual P2 checklist executed before wider rollout
- Any P2 failure logged with issue owner + target fix release

## Execution commands

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```
