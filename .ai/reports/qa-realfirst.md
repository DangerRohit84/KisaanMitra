# QA Report — real-first hardening (backend/server.js rewrite, .env.example, verify-real-first.js, SourceBadge, firebase auth toast)
Verdict: PASS

Date (UTC): 2026-09-30
Scope: `backend/server.js` rewrite, `.env.example`, `backend/scripts/verify-real-first.js`, `SourceBadge`, firebase auth error toast. Senior-dev claims: 34/34 PASS, mock boot PASS, frontend build PASS, no keys committed.
Result: All claims VERIFIED (with one doc-count note below — still PASS).

## Tests Run

### 1. Static contract — `node backend/scripts/verify-real-first.js`
- Command: `node backend/scripts/verify-real-first.js`
- Result: GREEN, exit 0, 32/32 PASS lines observed (task brief says "34 asserts" — script actually contains 32 `need()` calls: 4+2+3+3+2+2+2+12+2=32. Count mismatch is doc-only, all existing asserts pass).
- Evidence (all PASS):
  - gemini: safe JSON parse helper exists / raw fallback field exists / source gemini-live flag exists / logging exists
  - weather: owm-error source exists / logging exists
  - mandi: Agmarknet live path gated on key / stale warning exists / honest source label
  - places: Nearby Search live fetch exists / places-live source exists / dishonest places-api label removed
  - sms: provider path exists / queued flag exists
  - firestore: persist flag exists / ready/store flag exists
  - auth: swallow catch(()=>{}) removed / error surfaced via event/export
  - .env.example contains GEMINI_API_KEY, OPENWEATHER_API_KEY, MAPS_API_KEY, VITE_MAPS_API_KEY, FIREBASE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS, VITE_FIREBASE_, SMS_PROVIDER, SMS_KEY, ENABLE_GENKIT, MOCK_MODE, AGMARKNET_KEY (12/12)
  - frontend: source badges present / SourceBadge.jsx exists

### 2. Syntax — `node --check`
- `node --check backend/server.js` → exit 0
- `node --check backend/scripts/verify-real-first.js` → exit 0

### 3. Mock boot + `/api/health services{}`
- Command: `PORT=18080 MOCK_MODE=true node server.js` (backend/)
- Boot log: `[kisaanmitra] booting…` / `[firestore] no creds — in-memory store (persist:false)` / `KisaanMitra API on :18080 mock=true model=gemini-1.5-flash` / `[services] weather=mock mandi=static-csv places=static sms=mock-log firestore=memory genkit=off`
- `GET /api/health` → 200:
  ```json
  { "ok": true, "mock": true, "model": "gemini-1.5-flash", "genkit": { "promptBuilders": true, "flowActive": false, "mode": "prompt-builders+mock (Day1)" }, "services": { "gemini": "mock", "weather": "mock", "mandi": "static-csv", "places": "static", "sms": "mock-log", "firestore": "memory" } }
  ```
- PASS — services{} matches expected mock map.

### 4. `GET /api/weather source mock`
- `GET /api/weather?lat=22.71&lon=75.85` → 200 `source: "mock"`, `place: "Indore (mock)"`, `cached: false`, honest Hindi mock advisory. PASS.
- Invalid: `GET /api/weather?lat=999&lon=999` → 400 `{ error: "invalid lat/lon (lat -90..90, lon -180..180)" }`. PASS.

### 5. `GET /api/mandi staleDays`
- `GET /api/mandi?crop=soybean` → 200 `source: "agmarknet-static-csv"`, `price: 4892`, `market: "Indore"`, `updatedAt: "2026-09-28"`, `stale: false`, `staleDays: 2`, `csvDate: "2026-09-28"`. PASS — fresh (threshold stale>2).
- Unknown: `GET /api/mandi?crop=potatoXYZ` → 404 `{ error: "unknown crop", suggestions: [soybean,wheat,maize,cotton,onion,potato,tomato,mustard,gram_chana,paddy] }`. PASS — never silently returns soybean.

### 6. `GET /api/mandis/nearby mock-static`
- `GET /api/mandis/nearby?lat=22.71&lon=75.85` → 200 `source: "mock-static"`, 3 results (Choithram Mandi, Sanwer, IFFCO Bazar), `mapsHint` to set MAPS_API_KEY. PASS.

### 7. `POST /api/diagnose persist:false`
- `POST /api/diagnose` with `Idempotency-Key: qa-test-1`, `{imageBase64:"dGVzdA==",lang:"hi",crop:"soybean"}` → 200 `source:"mock"`, `model:"mock"`, `persist:false`, `store:"memory"`, disease Soybean Yellow Mosaic, latency ~411ms. PASS.
- Missing header → 400 `{ error: "Idempotency-Key header required" }`. PASS.
- Oversize 2.8M chars → 413 `{ error: "image too large…" }`. PASS.
- Dedup: same Idempotency-Key twice → second has `deduped:true`. PASS.

### 8. `POST /api/sms/log sms queued`
- `POST /api/sms/log {phone,message,lang}` → 200 `{ ok:true, sent:false, queued:true, provider:"mock-log", source:"mock-log", note:"Simulated…" }`. PASS.
- `GET /api/sms/log` pattern verified in code (slice(-20).reverse). No crash.

### 9. `POST /api/chat`
- `POST /api/chat {text:"hello",lang:"hi"}` → 200 `source:"mock"`, `model:"mock"`, Hindi reply + disclaimer. PASS.

### 10. Unknown API contract
- `GET /api/nope` → 404 `{ error:"unknown api route", path:"/api/nope" }`. PASS — JSON not SPA HTML.

### 11. Frontend build
- `npm run build` in `frontend/` → `vite v5.4.21 building… 38 modules transformed → dist/index.html 1.16kB, assets/index-*.css 26.19kB, assets/index-*.js 174.99kB, built in 1.32s`, exit 0. PASS.

### 12. No keys committed
- `.env.example` all values empty (verified read), header warns NEVER commit real keys. PASS.
- `Test-Path .env / backend/.env / frontend/.env` → False/False/False (no local secret files to leak). PASS.
- `.gitignore` covers `.env`, `frontend/dist/`, `*/node_modules/`, `*.log`, `.firebase/`. PASS (note: `backend/.env` covered by bare `.env` rule — works but explicit `backend/.env` would be clearer, non-blocking).
- `git ls-files | grep .env|serviceAccount|key.json` → empty. `git status` → repo has zero commits yet, all files untracked (`??`), so nothing committed at all — trivially no keys committed. PASS.
- Senior-dev claim "no keys committed" VERIFIED.

### 13. SourceBadge + firebase auth toast (additive, contracts same)
- `frontend/src/components/SourceBadge.jsx` exists (23 lines, handles live/mock/error/stale, title `src:` + cached + extra). PASS.
- Imported + rendered in all 5: `WeatherMandi.jsx` (weather cached + mandi stale+staleDays), `MapView.jsx` (src+srcErr), `DiagnosisCard.jsx` (source||model), `SmsLog.jsx` (source||provider), `ChatBox.jsx` (src). Grep 15 matches. PASS.
- `frontend/src/firebase.js`: `signInAnonymously(auth).catch((e)=>surfaceAuthError(...))`, dispatches `window "auth-error"` + `window.__FIREBASE_AUTH_ERROR`, no `catch(()=>{})`. PASS.
- `frontend/src/App.jsx`: `useState(window.__FIREBASE_AUTH_ERROR)`, `addEventListener("auth-error")`, `{authErr && <div role="alert" className="auth-toast">}` bilingual + dismiss. PASS.

## Bugs Found (severity: critical/high/medium/low, file:line)
- None blocking. No critical/high/medium/low defects found in real-first scope. All happy paths, edge cases (empty/invalid/oversize/unknown), boundary (lat/lon, image 2.8M, staleDays=2 threshold), error conditions (400/404/413/502 paths present in code), and honest `source` labelling verified.
- Note (trivial/doc, not a bug in app code): task brief says "verify-real-first.js 34 asserts" but script contains 32 `need()` asserts. Suggest updating brief/docs to "32 asserts" to avoid confusion. File: `backend/scripts/verify-real-first.js:1-62`.

## Regression Risks
- Mandi CSV freshness: `backend/data/mandi_prices.csv` dated 2026-09-28, `staleDays:2`, `stale:false` (threshold >2). Will flip to `stale:true` + warning within ~1 day unless CSV refreshed or `AGMARKNET_KEY` set. Low risk, by design (honest warning), but monitor for demo.
- Firestore memory mode: `persist:false`, `store:"memory"` when no creds — diagnoses/sms lost on restart. Expected for mock; do not rely on in-memory logs for pilot evaluation.
- Git repo has zero commits (master, untracked all). No rollback point; any `git clean -fd` would wipe work. Recommend initial commit (without keys) before further hardening.
- Weather singleflight+TTL 1h: mock `source:mock` cached per lat/lon rounded 2dp — stale mock could mask live-key addition for up to 1h after key set without restart. Restart server after adding `OPENWEATHER_API_KEY`.
- SMS `queued:true` mock-log path is silent-success to UI (`ok:true`) — UI must surface `queued` + SourceBadge so testers don't mistake mock for delivered SMS. Badge already does this; keep it.
- Image guard 2.8M chars vs 8mb JSON limit: clients compressing to ≤1024px jpeg 0.7 stay under 413; larger DSLR uploads will 413 — ensure frontend compresses before POST (server message already guides this).
- Smoke for release: `/api/health`, `/api/weather?lat=22.71&lon=75.85`, `/api/mandi?crop=soybean`, `/api/mandis/nearby`, `POST /api/diagnose` (idem key), `POST /api/sms/log` (queued), `POST /api/chat`, `vite build`.

---
QA Engineer: test files only, no app-code changes made. Full log evidence captured above.
