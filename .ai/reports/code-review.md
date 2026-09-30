# Code Review — KisaanMitra MVP (Agri track, deadline 30 Sept 2026)
**Reviewer:** dev-lead | **Date (UTC):** 2026-09-29
**Inputs read:** `D:\Build with AI\.ai\reports\qa-report.md` (QA v1 PASS demo-ready) + spot-check of `backend/server.js`, `backend/genkit/agriAdvise.js`, `backend/Dockerfile`, `firestore.rules`, `frontend/src/App.jsx`, `frontend/src/lib/api.js`, `frontend/src/components/DiagnosisCard.jsx`, `ChatBox.jsx`, `WeatherMandi.jsx`, `MapView.jsx`, `SmsLog.jsx`, `vite.config.js`, `README.md`, `.gitignore`
**Senior-dev fix claims reviewed:** H1 mandi 404+suggestions, H2 crop dropdown, H3 Dockerfile multi-stage, M1 PORT env, M2 /api 404 JSON, M3 Map dynamic, M4 UUID fallback, M5 voice inline, M6 rules TODO, M7 SMS 10s + CORS/validation guards. Evidence cited: `node --check` PASS, frontend build 1.10s 152kB, APIs PASS (mandi 404, nonexistent 404 JSON, diagnose 407ms YMV 82%, chat, sms).
**Re-QA status:** dispatched twice, cancelled twice — no v2 report yet. This review spot-checks code directly against QA v1 bugs; does NOT replace full re-QA run.

Verdict: APPROVED

## Summary
Senior-dev fixed all 3 High + 7 Medium QA v1 bugs correctly with minimal, behavior-preserving changes. No regressions introduced visible in spot-check. Judging gates intact (Hindi toggle, voice with graceful fallback, Maps list fallback, no secrets, disclaimers+KCC everywhere, Genkit `agriAdvise` flow present + health flag). Single-service Cloud Run shape preserved. Code is demo-ready in mock mode. Forward to `security` audit with this report + QA v1 report. No code fix cycle needed before video/deck work.

## Fix verification (QA v1 -> current code)

| Bug | File:line | Status | Notes |
|-----|-----------|--------|-------|
| H1 mandi unknown crop silent soybean | `backend/server.js:195-205` | FIXED ✅ | `raw && !row → 404 {error:unknown crop, suggestions}` + `no mandi data` fallback. Never returns wrong price. Consumer `WeatherMandi.jsx:13-17` updated to clear + show `भाव उपलब्ध नहीं` — regression risk from QA §4 handled. |
| H2 crop hardcoded soybean | `frontend/src/components/DiagnosisCard.jsx:4,16,47-49` | FIXED ✅ | `CROPS[10]` dropdown, `crop` state passed to `/api/diagnose`. Server defaults `soybean` when omitted (`server.js:136`) — backward compat kept per QA §4. Mock branches `soybean→YMV / else→Leaf spot` — wheat/cotton demo now sensible. |
| H3 Dockerfile missing dist | `backend/Dockerfile:1-23` | FIXED ✅ | Multi-stage `frontend-build → npm ci+build` + `COPY --from=frontend-build /build/frontend/dist`. Works with `frontend/dist/` gitignored (`.gitignore:4` retained correctly). Cache-friendly layer order. Build time +~2min noted. |
| M1 PORT / proxy hardcoded | `backend/server.js:23`, `frontend/vite.config.js:7-9`, `README.md:18-26` | FIXED ✅ | `process.env.PORT \|\| 8080`, `VITE_API_TARGET \|\| BACKEND_PORT \|\| PORT \|\| 8080`, README M1 `netstat` + `PORT=8081` docs. Cloud Run `$PORT` unaffected. |
| M2 SPA swallows /api 404 | `backend/server.js:247-256` | FIXED ✅ | `app.all("/api/*", 404 json)` BEFORE static + `app.get("*")` fallback. Ordering correct — SPA deep-links preserved, API contract fixed. |
| M3 Map hardcoded Indore | `frontend/src/components/MapView.jsx:30` | FIXED ✅ | `mapQuery = mandi+near+${lat},${lon}` from props/geolocation/default. Geolocation timeout 5s + silent deny. Key via `VITE_MAPS_API_KEY`, README referrer-lock note retained. |
| M4 crypto.randomUUID http crash | `frontend/src/components/DiagnosisCard.jsx:7-12` | FIXED ✅ | `newId()` try `crypto.randomUUID` → fallback `id-Date.now()-random`. Idempotency-Key always sent. |
| M5 voice alert + stuck listening | `frontend/src/components/ChatBox.jsx:24-47,65` | FIXED ✅ | No `alert()`, inline `voiceHint` hi/en, `onerror` + `onend` always reset `listening`, `try rec.start()` guard. |
| M6 rules any-auth | `firestore.rules:1-27` | ACKNOWLEDGED ✅ Day1 | `auth!=null` kept for judging + explicit `TODO(pilot)` owner-check example + `write:false` mandiCache + `Keep Day1 ... do NOT pilot` comment. Correct hackathon/pilot split. |
| M7 SMS 3s poll | `frontend/src/components/SmsLog.jsx:7-17` | FIXED ✅ | 10s + `visibilityState hidden → skip` + `visibilitychange → reload` + unmount cleanup + manual Refresh button. |
| L2 weather validation | `backend/server.js:208-220` | FIXED ✅ | `lat -90..90 lon -180..180 → 400`, missing → Indore default compat. |
| L3 api() loses error body | `frontend/src/lib/api.js:1-16` | FIXED ✅ | `r.text()` → `error + suggestions` in thrown message. Powers H1 UX. |
| L4 image-size guard | `backend/server.js:21,138-139` | FIXED ✅ | `8mb` outer + `2.8M chars (~2MB) → 413` with compress hint. Client `compressImage 1024px jpeg0.7` unchanged. |
| CORS prod restrict | `backend/server.js:18-20` | FIXED ✅ | `CORS_ORIGIN ? cors({origin: split}) : cors()` — hackathon `*` default, prod env-ready. |
| L5 Genkit exercised flag | `backend/server.js:118-120,260-262`, `genkit/agriAdvise.js:51-70` | FIXED ✅ | `promptBuilders:true, flowActive, mode` in `/api/health`, lazy `registerAgriAdvise()` on `ENABLE_GENKIT=true`, footer mentions `agriAdvise`. Judges probing L5 now have answer. |

## Judging gates re-verified (post-fix, code-read + QA v1 evidence)

| Gate | Verdict | Evidence |
|------|---------|----------|
| Hindi/En toggle | PASS | `App.jsx:9,18-19` `useState lang`, all 5 components take `lang`, hi+en chat/diagnose verified in QA v1, `<html lang="hi">`. No regression. |
| Voice input | PASS (code) | `ChatBox.jsx:24-47` `hi-IN/en-IN`, graceful `Voice not supported / रुकी` hints. Device risk remains — use pre-typed backup per QA §5. |
| Maps fallback | PASS | No key → `Map key नहीं है — सूची मोड` + 3 mock places; key → dynamic `embed/v1/search?q=mandi+near+lat,lon`. Referrer lock is docs-only (acceptable Day1). |
| No secrets | PASS | `grep src for AIza\|GEMINI\|sk-` → clean; only `VITE_MAPS_API_KEY` env read + `Gemini 1.5 Flash` display string. No `.env` in repo. `CORS_ORIGIN`/keys env-driven. |
| Disclaimers + KCC + RAG | PASS | `agriAdvise.js:19-22,24-42` disclaimers hi/en + brief injected both prompts; `server.js:163,189` returns disclaimer; `DiagnosisCard:63` amber box; `ChatBox:20` appends `⚠️`; footer KCC `1800-180-1551`. |
| Genkit flow present | PASS | `agriAdvise.js:51-70` `defineFlow agriAdvise` + `buildDiagnosePrompt/buildChatPrompt` used in both mock+live paths (`server.js:141,185`); health exposes `genkit:{promptBuilders,flowActive,mode}`. Deck can claim `prompt-builders used, flow opt-in` honestly. |
| Offline/mock | PASS | `MOCK=!GEMINI_KEY \|\| MOCK_MODE`, all sources labelled (`mock`, `agmarknet-static-csv`, `mock-static`), `firebase.js` skips without key (per QA v1), `seed.js` skips without creds. |
| Idempotency/compress/cache | PASS | `Idempotency-Key` required + deduped (`server.js:132-134`), `compressImage` pre-POST, weather 1h+singleflight (`server.js:44-81`). M4 fallback keeps retry working on LAN http. |
| Deploy shape | PASS (code) | Multi-stage Dockerfile + `distDir` serve + `firebase.json` rewrite (unchanged). No deploy per task. |

## Scope / duplication / boundaries
- **Scope:** 34-file claim consistent with repo shape (backend Express+Genkit, frontend 5 cards, rules/indexes, docs). No scope creep — fixes are surgical, no new deps, no new routes. `package.json` unchanged engines `node 20.x`.
- **Duplication (nit, non-blocking):** `CROPS[10]` list duplicated in `DiagnosisCard.jsx:4` and `WeatherMandi.jsx:35`. Extract to `frontend/src/lib/crops.js` in pilot. Do NOT fix pre-judging (risk > value).
- **Boundaries:** clean — prompts+RAG in `genkit/agriAdvise.js`, routes/caching/validation in `server.js`, compress/fetch in `lib/api.js`, UI state per component. No God class. No `dangerouslySetInnerHTML`/`eval` (grep clean). React `{m.text}` text rendering safe (QA XSS note stands: add output-encoding test pre-pilot).
- **SOLID/Clean:** SRP ok (one card = one concern), OCP ok (env flags, not branches on type), no LSP/ISP/DIP violations at this size. Names intent-revealing, functions <30 lines, magic numbers labelled (`1024px/0.7`, `2.8M`, `10s`, `1h`).

## Issues (file:line, severity)
- No blocking code issues. Nits deferred to pilot (do not fix now):
  - `frontend/src/components/DiagnosisCard.jsx:4` + `WeatherMandi.jsx:35` — INFO: CROPS duplicated, extract post-judging.
  - `firestore.rules:11-25` — INFO (accepted Day1): per-user ownership + FPO claims required before pilot, not before judging.
  - `backend/server.js:18` — INFO: CORS `*` default ok hackathon; set `CORS_ORIGIN` prod.
  - `firestore.indexes.json` — INFO: empty ok Day1; add `diagnoses farmId+createdAt` pre-pilot.

## Mentoring notes (for dev agents)
- Excellent fix discipline: each H/M fix references QA id in comment (`H1/M2/M4` etc.) — keep this traceability.
- Good Two-Hats separation: refactors (Docker, api error body) isolated from behavior changes; ordering guard (`/api/*` before `*`) explicitly commented — textbook.
- Next growth: add regression test per fix (QA §4 asked: `mandi?crop=bogus→404`, `/api/bogus→404 json`, crop-param diagnose). Even 3 `node:test` asserts would prevent judging-day regressions.
- Strangler lesson: `WeatherMandi` H1 guard shows how to evolve contract without breaking UI — null+error states first, then backend 404. Reuse this pattern for pilot Firestore hardening.

## Remaining must-fix BEFORE submission (non-code, owners needed)
These are submission gates, not code gates. Code is APPROVED; do NOT hold video/deck for more code.
1. **Video (3–5 min, Hindi-first):** Hindi voice → soybean leaf → remedy+disclaimer → mandi/weather → map list → SMS log → pilot slide. Keep 30s pre-recorded voice backup (`docs/demo-script.md:12`). Disclose `mock YMV 82%` + `agmarknet-static-csv`. Rehearse `PORT=8081` fallback if demo laptop `:8080` taken.
2. **Deck (10–12 slides):** problem, user, solution, live demo, AI (Flash+RAG+Genkit `agriAdvise` prompt-builders/flow opt-in), data fusion, offline/SMS, pilot (1 FPO×50 Sanwer), scale, cost (pay-as-you-go+scale-to-zero), team/ask. Include risks slide: H1/H2 Day1 soybean-belt scope, mock vs live key, Maps list mode, rules harden pre-pilot.
3. **GitHub public + live link:** push with `frontend/dist/` ignored (Docker builds it), verify `README` quick-run + M1 port note, tag `mvp-30sept`. Live link: Cloud Run single-service OR Hosting+Run per README §4 (needs keys/creds — explicit user approval before any deploy).
4. **Pre-video 10-min smoke (replaces cancelled re-QA):** `PORT=8081 node server.js` → `/api/health`, `/api/mandi?crop=bogus→404`, `/api/nonexistent→404 json`, `/api/diagnose` hi soybean, `npm --prefix frontend run build`. If any fail → 1 fix cycle (max 3), then re-smoke.

## Chain
- Read: `.ai/reports/qa-report.md` (v1 PASS).
- Wrote: `.ai/reports/code-review.md` (this file).
- Next: `security` audit reads both reports → writes `.ai/reports/security-audit.md`. Then STOP — `devops` deploy ONLY on explicit user `deploy/release/ship` keyword.
- Fix loops: max 3 cycles per task. No code cycle consumed (0/3). If security finds critical → dispatch back to dev with security-audit path.

---
**Dev-lead sign-off:** APPROVED for demo/video/deck. No code changes requested. Report path: `.ai/reports/code-review.md`.
