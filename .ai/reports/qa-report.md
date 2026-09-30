# QA Report — KisaanMitra Agri Advisory MVP
**Date (UTC):** 2026-09-29 | **Mode:** mock=true (no keys) | **Commit/Files:** 36 files (non-node_modules), frontend/dist present locally
**Verdict: PASS** — demo-ready in mock mode on workaround port. No critical blockers. 3 high bugs should be fixed if 1-hour window exists, else use workarounds below. DO NOT deploy (per task).

## 1. Run Verification

| Check | Result | Evidence |
|---|---|---|
| backend `npm install` | PASS | `backend/node_modules` exists, `backend/package-lock.json` present, `node server.js` boots: `KisaanMitra API on :8081 mock=true model=gemini-1.5-flash` |
| backend `:8080` | FAIL (env conflict, not app bug) | `0.0.0.0:8080 LISTENING PID 5124 httpd (EnterpriseDB)` — backend 404 on `:8080/api/health`. Workaround: `PORT=8081` → all APIs PASS. Cloud Run unaffected (provides `$PORT`). See Bug M1 |
| backend `:8081` (workaround) `/api/health` | PASS | `{"ok":true,"mock":true,"model":"gemini-1.5-flash"}` |
| `GET /api/seed` | PASS | returns demo-farmer-1, farm-1 (soybean 2.5ac Sanwer), diag-seed-1 YMV 82%, mandiCache 2 rows |
| `GET /api/mandi?crop=soybean` | PASS | `4892/quintal Indore 2026-09-28 agmarknet-static-csv` |
| `GET /api/mandi` all 10 crops | PASS | soybean 4892, wheat 2275, maize 2090 Dewas, cotton 6620 Khargone, onion 1805 Shajapur, potato 1420, tomato 2100, mustard 5650 Ujjain, gram_chana 5440 Sehore, paddy 2183 Hoshangabad |
| `GET /api/weather?lat=22.7196&lon=75.8577` | PASS | mock `29C 72% हल्के बादल Indore(mock) advisory: अगले 24h बारिश संभव — छिड़काव टालें`, 2nd call `cached:true` (1h TTL + singleflight works) |
| `GET /api/mandis/nearby` | PASS | `mock-static` 3 results: Choithram 1.8km, Sanwer 28km, IFFCO 2.1km + mapsHint |
| `POST /api/chat` hi | PASS | echoes `soybean me peele dhabbe` → Hindi whitefly+traps + follow-up, `disclaimer` + KCC 1800-180-1551, `model:mock` |
| `POST /api/chat` en | PASS | English equivalent + EN disclaimer |
| `POST /api/chat` missing text → 400 | PASS | correctly 400 |
| `POST /api/diagnose` hi soybean + Idempotency-Key | PASS | YMV suspected 82%, Hindi remedy, dosage `Thiamethoxam 25% WG @100g/ha ONLY per label+officer`, urgency medium, `latencyMs ~404-412`, disclaimer, farmId, createdAt, model mock |
| `POST /api/diagnose` same key → deduped | PASS | 2nd call returns identical + `deduped:true` (safe retry works) |
| `POST /api/diagnose` missing key → 400 | PASS | correctly 400 `Idempotency-Key required` |
| `POST /api/diagnose` missing image → 400 | PASS | correctly 400 |
| `POST /api/diagnose` en wheat | PASS | `Leaf spot (suspected)` + EN remedy (branch coverage) |
| `POST /api/sms/log` + `GET /api/sms/log` | PASS | `ok:true id:sms-<ts> note: Simulated Prod MSG91/Twilio DLT`, raw `[{...}]` array correct (PS `value/Count` wrapper is client artifact) |
| SMS truncation 500→320 | PASS | stored len 320 |
| Chat injection `<script>alert(1)</script> '; DROP...` | PASS (with note) | JSON-escaped `\u003c`, no crash, no SQL (no DB). Frontend `ChatBox.jsx:40 {m.text}` uses React text (safe, no `dangerouslySetInnerHTML`). Still add output-encoding test before pilot |
| Chat 5000 chars | PASS | no crash, mock truncates input to 80 chars in reply, reply len 178 |
| Diagnose latency 3x | PASS | backend 412/404/406ms, wall 468/407/408ms — well under `p95<2.5s` mock claim (real Flash latency untested) |
| Backend serves `frontend/dist` (single-service) | PASS | `GET :8081/` → 200 `<!doctype html><html lang="hi">.../assets/index-ud9WYI9i.js` |
| Frontend `npm run build` | PASS | `vite v5.4.21 built in 1.25s, 37 modules, index 0.41kB, css 8.79kB, js 150.77kB gzip 49.25kB` |
| Frontend `vite dev :5173` | PASS | `VITE ready 280ms http://127.0.0.1:5173/`, `GET /` 200 `lang="hi"` + `/src/main.jsx` |
| Vite proxy `/api` → `:8080` | FAIL (env consequence) | `GET :5173/api/health` 404 (httpd, not backend). Will PASS when `:8080` free. For QA we hit `:8081` directly |
| CORS | INFO | `Access-Control-Allow-Origin: *` (ok hackathon, restrict prod) |
| Unknown `/api/nonexistent` | FAIL (bug) | returns 200 `index.html` instead of 404 JSON — see Bug M2 |

Processes left running for next chain steps: backend `:8081` PID 36188 (`C:\Users\Rohit\AppData\Local\Temp\opencode\backend-qa.log`), frontend `:5173` PID 39152 (`frontend-qa.log`). Kill via `Stop-Process` or `taskkill` when done.

## 2. Hackathon Judging Gates

| Gate | Verdict | Notes |
|---|---|---|
| Problem-Solution Fit (Hindi smallholder, patchy net) | PASS with gap | Hindi UI + voice + SMS fallback present. Gap: `DiagnosisCard` hardcodes `crop:soybean` — wheat/cotton demo fails (High H2). Workaround: demo soybean only |
| AI doing real work (vision→remedy?) | CONDITIONAL PASS (mock) | Mock deterministic YMV 82% + Hindi remedy + dosage + disclaimer + RAG `agronomy_brief.md` injected via `buildDiagnosePrompt`. Real Gemini Flash untested (no key). Genkit `agriAdvise` flow defined but bypassed in mock (`ENABLE_GENKIT` unset) — judges may probe (Low L5) |
| End-to-end flow (photo→remedy→mandi/weather→map→SMS) | PASS (mock) | Verified each API + `DiagnosisCard.jsx:22-26` auto-logs SMS after diagnose, `WeatherMandi`, `MapView`, `SmsLog` poll. Full browser click-through not run (no Playwright), code-wired |
| Hindi/En toggle | PASS | `App.jsx:9,18-19` `useState lang`, all 5 components take `lang`, live `hi`+`en` chat/diagnose verified, disclaimers both langs, `<html lang="hi">` |
| Voice input | PASS (code) / RISK (device) | `ChatBox.jsx:23-32` `SpeechRecognition hi-IN/en-IN`. Not live-tested (needs mic+Chrome). `alert()` + no `onerror` — risky on low-end/battery browsers (Medium M5) |
| Maps | PASS (fallback) / RISK (live) | No `VITE_MAPS_API_KEY` → list mode `Map key नहीं है — सूची मोड` + 3 mock places. Live `iframe embed/v1/search` needs key + HTTP-referrer restriction (Medium M3, hardcoded query) |
| Offline/mock fallback | PASS | `MOCK=true` without keys, `firebase.js:16 if(cfg.apiKey)` skips auth, weather/mandi/nearby/SMS all mock-labelled (`source:mock`, `agmarknet-static-csv`, `mock-static`), `seed.js` skips Firestore without creds |
| No secrets in client | PASS | `Select-String` src for `AIza|GEMINI|OPENWEATHER|sk-` → only `VITE_MAPS_API_KEY` env read + display string `Gemini 1.5 Flash`. Dist scan clean. No `.env` files found. `VITE_*` correctly env-driven |
| Firestore rules | PASS (Day1) / MUST-HARDEN pilot | `firestore.rules` `auth!=null` for users/farms/diagnoses/smsLog, `mandiCache write:false` correct. No per-user ownership — any authed user can read/write others (Medium M6, acknowledged in comments) |
| RAG + disclaimer + KCC | PASS | `agronomy_brief.md` 5 crops + safety, injected in both prompts, disclaimers Hi/En + `KCC 1800-180-1551` in every chat/diagnose + UI amber box + footer |
| Idempotency + compress + cache | PASS | `Idempotency-Key` required + deduped, `compressImage 1024px jpeg0.7` in `api.js:7-22` used pre-POST, weather 1h+singleflight verified |
| Deploy ready (not deploying) | FAIL (build gap) | `backend/Dockerfile:7 COPY frontend/dist` but `.gitignore:4 frontend/dist/` ignored → fresh `gcloud run deploy --source .` breaks. Must build in Docker (High H3) |

## 3. Bugs Found

**High (fix this sprint / before judging if time, else workaround):**
- H1 — `backend/server.js:186-191` `/api/mandi?crop=unknown` silently returns soybean row as if correct crop. Farmer sees wrong price with no warning. Fix: 404 `{error:unknown crop}` or `{fallback:true}` flag. Workaround: demo only 10 known crops.
- H2 — `frontend/src/components/DiagnosisCard.jsx:19` `crop:"soybean"` hardcoded, no selector. Non-soybean farmers get wrong remedy. Fix: dropdown (soybean/wheat/maize/cotton/...) passed to `/api/diagnose`. Workaround: demo soybean leaf only.
- H3 — `backend/Dockerfile:7` + `.gitignore:4` `frontend/dist/` ignored → Cloud Run `--source` build missing `dist` (COPY fails / serves API-only). Fix: multi-stage Docker (`FROM node:20 AS build → npm ci + run build`) or `gcloud builds` pre-step. Workaround: local `npm --prefix frontend run build` before deploy (already done, dist present locally).

**Medium (fix next sprint / before pilot, note in deck risks slide):**
- M1 — Env: `:8080` occupied by `httpd (EnterpriseDB)` PID 5124 on QA box. `README:12-13` quick-run fails here. Fix docs: `netstat -ano | findstr 8080` + `PORT=8081` override note. Not app bug. `vite.config.js:8` proxy hardcodes `:8080` — make `VITE_API_TARGET` env-overridable.
- M2 — `backend/server.js:228-230` `app.get("*")` SPA fallback swallows unknown `/api/*` → 200 `index.html`. Breaks API contract/debugging. Fix: `app.get("/api/*", 404 json)` before `app.get("*")`.
- M3 — `frontend/src/components/MapView.jsx:18` embed `q=mandi+near+Indore` hardcoded, ignores `lat/lon` + `places` results; key in URL needs referrer lock (README notes, not enforced). Fix: dynamic `q=mandi+near+${lat},${lon}` + document restriction steps.
- M4 — `frontend/src/components/DiagnosisCard.jsx:18` `crypto.randomUUID()` throws on non-secure `http://192.168.x.x` field demo (phone → laptop). Fix: fallback `Date.now()+Math.random()` or `uuid` polyfill.
- M5 — `frontend/src/components/ChatBox.jsx:23-32` voice: `alert()` blocks, no `onerror/onend` reset, `listening` stuck on deny. Fix: inline hint + `rec.onerror` reset.
- M6 — `firestore.rules:6-21` any `auth!=null` can read/write any `farms/diagnoses/users/smsLog`. Fix pilot: `allow read,write: if request.auth.uid==resource.data.uid` + FPO claims; keep Day1 for hackathon.
- M7 — `frontend/src/components/SmsLog.jsx:7` `setInterval 3s` unconditional polling. Fix: 10s + `document.visibilityState` pause + stop on unmount already ok.

**Low (backlog / polish):**
- L1 — `backend/server.js:18` CORS `*`. Restrict to hosting domain prod.
- L2 — `backend/server.js:194-197` `/api/weather` no lat/lon validation (`?lat=abc` returns mock Indore as valid). Add 400 + range check.
- L3 — `frontend/src/lib/api.js:1-5` `api()` throws `path -> status` losing backend `error` body. Include `await r.text()`.
- L4 — `backend/server.js:19` `express.json 8mb` no image-size guard; large base64 risks Flash limit/OOM. Enforce e.g. 2MB post-compress + 413.
- L5 — Genkit `agriAdvise` (`backend/genkit/agriAdvise.js:51-70`, `server.js:25,233-236`) defined but never invoked in mock (`ENABLE_GENKIT` unset). Either demo `registerAgriAdvise` log or deck footnote `prompt-builders used, flow opt-in`.
- L6 — `backend/data/mandi_prices.csv: updated 2026-09-28` static Day1. Label staleness in UI (already `src: agmarknet-static-csv` — good, keep).
- L7 — `firestore.indexes.json` empty — fine Day1, add `diagnoses farmId+createdAt` before pilot queries.

## 4. Regression Risks
- Fixing M2 (API 404) may break SPA deep-links if order wrong — keep `/api/*` 404 before `*` fallback, add test `GET /api/__404__ → 404 json` + `GET /random → 200 html`.
- Fixing H1 (mandi 404) will break `WeatherMandi.jsx:13` which assumes always-200 — update to show `भाव उपलब्ध नहीं` + keep soybean default only on explicit select.
- Fixing H2 (crop selector) changes `/api/diagnose` contract consumers — keep default `soybean` when omitted for backward compat.
- Fixing H3 (Docker build) increases Cloud Run build time ~2min — cache `npm ci` layers.
- Every bug fix must add regression test that would have caught it (e.g., `diagnose` crop param test, `mandi?crop=bogus → 404`, `GET /api/bogus → 404 json`).

## 5. Demo Risks & Mitigations (3–5 min video)
1. `:8080` taken on demo laptop → rehearse `PORT=8081` + `vite --port 5173` (proxy fails, hit backend directly or set `VITE_API`); on fresh judging laptop `:8080` likely free.
2. Voice fails (mic/permission/non-Chrome) → pre-type Hindi `सोयाबीन में पीले धब्बे हैं`, keep 30s pre-recorded capture per `docs/demo-script.md:12`.
3. No Maps key → stay in list mode, point to `Choithram 1.8km` + `mapsHint`; don’t promise live map.
4. No Gemini key → stay mock, disclose `model:mock YMV 82%` + RAG brief; optional 30s live-Gemini clip if key added.
5. `crypto.randomUUID` on `http` LAN → demo on `localhost` or `https`, or apply M4 polyfill pre-demo.
6. Wrong-crop question from judges → acknowledge H1/H2 as known Day1 limits, show `agronomy_brief.md` coverage + pilot scope `soybean belt Sanwer`.

## 6. Files Touched (QA only, no app code changed)
- Created: `.ai/reports/qa-report.md` (this file)
- Logs (temp, not repo): `C:\Users\Rohit\AppData\Local\Temp\opencode\backend-qa.log`, `frontend-qa.log`
- No application/feature files modified per hard boundary (report bugs, don’t fix).

## 7. Repro (PowerShell)
```powershell
# backend (workaround 8080 conflict)
cmd /c "set PORT=8081&& set MOCK_MODE=true&& node server.js" # in backend/
Invoke-RestMethod http://localhost:8081/api/health
Invoke-RestMethod http://localhost:8081/api/mandi?crop=soybean
Invoke-RestMethod "http://localhost:8081/api/weather?lat=22.7196&lon=75.8577"
Invoke-RestMethod "http://localhost:8081/api/mandis/nearby?lat=22.7196&lon=75.8577"
$guid=[guid]::NewGuid().ToString()
Invoke-RestMethod http://localhost:8081/api/diagnose -Method Post -ContentType "application/json" -Headers @{"Idempotency-Key"=$guid} -Body (@{imageBase64="data:image/jpeg;base64,AAA";lang="hi";farmId="farm-1";crop="soybean"}|ConvertTo-Json)
Invoke-RestMethod http://localhost:8081/api/chat -Method Post -ContentType "application/json" -Body (@{text="सोयाबीन में पीले धब्बे";lang="hi"}|ConvertTo-Json)
# frontend
cd frontend; npm run build; npx vite --port 5173
```

---
**QA Engineer sign-off:** PASS for hackathon demo in mock mode. Forward to `dev-lead` for review + `security` audit with this report. Fix loop recommended (max 3 cycles) for H1-H3 if time before 30 Sept judging; otherwise demo with workarounds + risks slide.

---
# Addendum 2026-09-30 — Redesigned UI QA (Khet Monsoon) — Verdict: PASS
Full report: `.ai/reports/qa-report-ui.md` (this addendum mirrors its verdict for chain handoff).
- `npm run build` PASS `vite v5.4.21 37 modules built in 1.45s` (matches claimed 1.49s). No new deps (`react, react-dom, firebase` only).
- `/api` unchanged: `diagnose, sms/log×2, chat, weather, mandi?crop=, mandis/nearby` all match `backend/server.js`. H1/M2/L3 fixes verified in code (`भाव उपलब्ध नहीं`, API error body preserved).
- Hindi-first PASS (`lang="hi"`, default `hi`, KCC `1800-180-1551`, crop Hindi names, SMS Hindi fallback).
- a11y 5/5 PASS: `focus-visible #1d6fd8`, `skip-link → #nidan`, `aria-live polite/assertive + role=alert`, `prefers-reduced-motion` kills ticker/scan, targets 44px base + 56px mic/input/send (`text-[16px]`, `touch-action`).
- Demo 9/9 PASS: lang toggle, hero dropzone (132px, drag+keyboard), vein-meter + `<0.7 संदिग्ध`, chat mic 56px `hi-IN` + inline hint, haldi ticker (pause on hover/focus), map `🧭 रास्ता` directions, SMS phone-thread (10s poll + visibility pause), empty/error Hindi guidance, responsive `max-w-6xl / lg:grid-cols-12 (7/5/7/5) / md:2col` for 360px + desktop.
- Bugs (all low, no app edits per boundary): chips 36px (`index.css:65`); lang/directions/refresh 40px (`App.jsx:71,78`, `MapView.jsx:67`, `SmsLog.jsx:33`); `<html lang>` static on EN toggle (`App.jsx:32`); object-URL leak (`DiagnosisCard.jsx:51,63`); hardcoded `farmId farm-1` (`:68`); geolocation silent Indore fallback (`MapView.jsx:18-21`).
- Regression risks: ticker 2-copy invariant, scan/skeleton timeout, SMS `slice(-20)` eviction, real-Flash latency vs mock `p95<2.5s`, reduced-motion snapshot, Idempotency fallback, rebuild `dist` before deploy.
- Gates: build ✅ no-deps ✅ api ✅ Hindi ✅ a11y ✅ demo ✅ no critical/high ✅ → **PASS**, forward to `dev-lead` + `security` with `.ai/reports/qa-report-ui.md`.

---
# Addendum 2026-09-30 — Real-First Hardening QA — Verdict: PASS
Full report: `.ai/reports/qa-realfirst.md` (this addendum mirrors its verdict for chain handoff).
- `node backend/scripts/verify-real-first.js` GREEN 32/32 (brief says 34, script has 32 — doc-only).
- `node --check` PASS server.js + verify script.
- Mock boot PASS `PORT=18080/18081/18082 mock=true`, `/api/health services{gemini:mock,weather:mock,mandi:static-csv,places:static,sms:mock-log,firestore:memory}`.
- `/api/weather` source mock + 400 invalid lat/lon; `/api/mandi?crop=soybean` agmarknet-static-csv staleDays:2 fresh; unknown crop 404+suggestions; `/api/mandis/nearby` mock-static 3 results; `POST /api/diagnose` persist:false store:memory + 400/413/deduped:true; `POST /api/sms/log` queued:true mock-log; `POST /api/chat` mock.
- `npm run build` PASS vite 38 modules 1.32s.
- No keys committed (.env.example empty, .gitignore covers .env, no backend/.env, git zero commits).
- SourceBadge.jsx + 5 components + firebase auth-error toast verified.
- Bugs: none blocking. Regression: CSV goes stale in ~1d, memory store volatile, zero commits, weather 1h TTL.
- Gates: contracts ✅ boot ✅ badges ✅ auth-toast ✅ build ✅ no-keys ✅ → **PASS**.
