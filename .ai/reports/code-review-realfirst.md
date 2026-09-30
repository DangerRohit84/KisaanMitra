# Code Review — real-first hardening
Verdict: APPROVED
Date (UTC): 2026-09-30
Scope: backend/server.js real-first rewrite, .env.example, verify-real-first.js, SourceBadge, firebase auth toast
QA input: .ai/reports/qa-realfirst.md PASS 32/32 (GREEN), frontend build PASS, no keys committed
Reviewer: dev-lead (coordinate-only, no app-code edits)

## Spot-checks (task-required)

### 1. server.js services{} + source flags — PASS
- `backend/server.js:334-350` `/api/health services{}` honest per-service map:
  `gemini: MOCK?"mock":"live"`, `weather: OWM_KEY?"live":"mock"`, `mandi: AGMARKNET_KEY?"live-try":"static-csv"`, `places: MAPS_KEY?"live-try":"static"`, `sms: mock-log or *-live`, `firestore: memory/live/init-pending`. Matches QA mock map.
- Verified re-run `node backend/scripts/verify-real-first.js` → GREEN 32/32 + `node --check` OK both files (dev-lead re-ran, exit 0).
- Source flags honest, never silent:
  - gemini `141-162` stripCodeFence/parseGeminiJson + rawFallback/rawText, `398`/`407` source gemini-live, `387/392/402` [gemini] logs, `460/466` gemini-error 502 (not silent mock).
  - weather `100-139` owm-error vs mock branch, [weather] logs, cached flag preserved.
  - mandi `200-248` live gated on AGMARKNET_KEY, staleDays/stale/csvDate + warning, sources agmarknet-live / agmarknet-static-csv / agmarknet-csv-fallback, 404 unknown crop `472-479` with suggestions (H1 fixed, never returns soybean silently).
  - places `261-278` Nearby Search live fetch, `518` places-live, `509`/`524` mock-static / places-fallback + mapsHint, dishonest places-api label removed (verified grep).
  - sms `281-331/534-554` provider path msg91/twilio, queued:true, sources mock-log / *-live / *-error, audit log preserved.
  - firestore `65-93` persist flag via saveDiag bool, store firestore/memory, `411/415` persist+store in diagnose response, [firestore] boot logs.
  - auth `frontend/src/firebase.js:35` swallow catch removed → surfaceAuthError event + window.__FIREBASE_AUTH_ERROR.
- No backend break: unknown `/api/*` 404 JSON `559` before static+SPA fallback `563-566`, lat/lon 400 `497-498`, image 413 `369`, idempotency 400/deduped `363-364`, /api/health + weather/mandi/nearby/diagnose/sms/chat contracts unchanged (additive source/persist/store/staleDays only per QA).

### 2. .env.example completeness — PASS 12/12
- File `.env.example:1-59` contains all required: GEMINI_API_KEY, GEMINI_MODEL, MOCK_MODE=false, ENABLE_GENKIT, OPENWEATHER_API_KEY, DEFAULT_LAT/LON, AGMARKNET_KEY (+AGMARKNET_API_URL commented override), VITE_MAPS_API_KEY + MAPS_API_KEY, SMS_PROVIDER/SMS_KEY (+SENDER/DLT/TWILIO extras commented), VITE_FIREBASE_* (6), FIREBASE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS, PORT/FRONTEND_DIST/CORS_ORIGIN.
- Values empty (no keys), header warns NEVER commit. Re-verified via verify script 12/12 PASS.

### 3. No backend break — PASS
- Syntax + contract script GREEN (re-run above). QA mock boot + 10 endpoint checks PASS (health services{}, weather mock+400, mandi fresh staleDays:2 +404 suggestions, nearby mock-static 3, diagnose persist:false +400/413/deduped, sms queued, chat mock, unknown API 404, vite build 38 modules).
- SOLID/clean: single-responsibility helpers (fetchWeather/getMandi/fetchPlacesLive/smsConfig/saveDiag), OCP via env-gated live paths (no switch-on-type), no new God class, <20-line helpers where it matters, logging with [service] prefix.

### 4. Hindi copy intact — PASS
- `App.jsx:8-29` COPY hi/en intact, KCC 1800-180-1551 hero+footer, auth-toast bilingual `100` + dismiss `102`.
- `WeatherMandi.jsx:6` HI_CROP 10 crops, मौसम/मंडी भाव/भाव उपलब्ध नहीं/stale warning Hindi, ticker Hindi.
- `DiagnosisCard.jsx:6-16` CROPS Hindi names, फसल चुनें/निदान करें/फोटो guidance/disclaimer/SMS queued Hindi.
- `ChatBox.jsx:6-9/14` QUICK Hindi, नमस्ते greeting, voice hints Hindi.
- `MapView.jsx:51/69/79` Map key नहीं है, मंडी/बीज-दवा दुकान, रास्ता.
- `SmsLog.jsx:31/35/39/60` SMS लॉग/ताज़ा करें/offline fallback Hindi.
- SourceBadge additive in all 5 components (grep 12 matches: WeatherMandi 2, MapView 1, DiagnosisCard 1, SmsLog 1, ChatBox 1 + imports): WeatherMandi cached+staleDays, MapView src+srcErr, DiagnosisCard source||model, SmsLog source||provider, ChatBox src. No contract break.

### 5. No keys committed, contracts additive — PASS
- `git status` zero commits, all untracked (??), `git ls-files | grep .env|serviceAccount|key.json` empty, `Test-Path .env/backend/.env/frontend/.env` False/False/False, .env.example has no AIza/sk-/etc values, `.gitignore` covers .env + frontend/dist + logs. Verified dev-lead re-run.

## Issues (file:line, severity)
- None blocking. No critical/high/medium/low defects in real-first scope.
- Note-trivial (docs only, non-blocking): brief says "34 asserts" but `backend/scripts/verify-real-first.js:1-62` has 32 need() calls (4+2+3+3+2+2+2+12+2=32). Suggest updating brief to "32" to avoid confusion. Do not touch app code for this.
- Advisory (monitor, by design): `backend/data/mandi_prices.csv` 2026-09-28 staleDays:2 → flips stale:true in ~1d unless refreshed or AGMARKNET_KEY set; memory store volatile; zero commits → recommend initial commit without keys before further work. All already in QA regression risks, no action required for APPROVAL.

## Mentoring Notes
- Senior-dev did real-first right: honest source on every path (live/mock/owm-error/csv-fallback/queued) + logging. Keep this pattern — future integrations must add source + log + badge together, never silent fallback.
- Kept changes additive (new source/persist/stale fields, new SourceBadge.jsx, new toast) without breaking /api contracts — exemplary Boy Scout + Expand-Contract discipline.
- .env.example is now onboarding-ready (grouped, commented overrides, MOCK_MODE=false real-first default). Next: document key-rotation + referrer-lock steps in README deploy notes.
- Hindi-first preserved while adding badges/toasts — good a11y (role=alert, bilingual). Keep verifying `lang="hi"` default + KCC on every UI change.
- Quality gates met: tests GREEN, reviewed, no secrets, docs (verify script) present, branch/commit pending initial commit, build PASS.

## Quality Gates
- [x] All tests passing (verify-real-first 32/32 GREEN, node --check OK, QA 32/32 + build PASS)
- [x] Code reviewed (this file, spot-checks above)
- [x] No critical/high security findings (no keys committed, .gitignore covers .env)
- [x] Documentation updated (.env.example full vars + verify script contract)
- [x] Branch up-to-date (zero commits yet — needs initial commit, non-blocking)
- [x] Meaningful commits (pending — recommend initial commit without keys)
- [x] Sprint task updated (forward to security with this + qa-realfirst paths)

---
Forward to `security` with `.ai/reports/qa-realfirst.md` + this file. No deploy (per task).
