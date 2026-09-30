# Security Audit — real-first hardening
Verdict: PASS

Date (UTC): 2026-09-30
Scope: `backend/server.js` rewrite, `.env.example`, `backend/scripts/verify-real-first.js`, `SourceBadge`, firebase auth toast
Inputs: `.ai/reports/qa-realfirst.md` PASS (32/32 GREEN + build PASS + no keys), `.ai/reports/code-review-realfirst.md` APPROVED
Auditor: security (audit-only, no app-code changes)

## Summary
Real-first hardening is secrets-safe and honestly-labelled. No keys committed, Gemini/SMS/Admin keys server-only, Maps/Firebase `VITE_` exposure is expected-public-key pattern with referrer/rules mitigations documented. OWM/Agmarknet errors surface without leaking keys. CORS-open, broad Firestore rules, and missing rate-limit/helmet are Day1-documented hackathon tradeoffs with code-level prod gates (`CORS_ORIGIN`, rules TODO "do NOT pilot") — acceptable for Day1, BLOCKING before pilot. No critical finding warrants FAIL for this stage.

## Checks (task-required)

### 1. No keys in repo — PASS
- `.env.example:1-59` all values empty (GEMINI/MOCK/OWM/AGMARKNET/MAPS/SMS/VITE_FIREBASE/FIREBASE_PROJECT_ID/GOOGLE_APPLICATION_CREDENTIALS/PORT/CORS_ORIGIN). Header warns NEVER commit.
- `.gitignore:3` `.env` covers root + `backend/.env` + `frontend/.env` (verified `git check-ignore -v` all three hit `.gitignore:3:.env`). Plus `frontend/dist/`, `node_modules/`, `*.log`, `.firebase/`, `.firebaserc`.
- `git ls-files | grep .env|serviceAccount|key.json` → empty. `git status` → zero commits, all untracked (`??`), `git log` fatal "no commits yet" — trivially nothing committed, so no keys committed. Matches QA §12.
- Grep `AIza|sk-|BEGIN PRIVATE|serviceAccount` → zero hits in repo. Only `GEMINI_API_KEY`/`OPENWEATHER` references are `process.env.*` reads + comments, never literal values.

### 2. Gemini key server-only, no VITE_ leak — PASS
- `backend/server.js:26` `GEMINI_API_KEY` read server-side only. Used only in `geminiText:165-178` / `geminiVision:180-198` via `new GoogleGenerativeAI(GEMINI_KEY)` — never sent to client; responses return `model` name + `source:gemini-live`, never key.
- Frontend grep `VITE_` → only `VITE_FIREBASE_*` (firebase.js:9-14) + `VITE_MAPS_API_KEY` (MapView.jsx:12). Zero `VITE_GEMINI` / `VITE_OPENWEATHER` / `VITE_SMS` hits. No `VITE_` Gemini exposure.

### 3. Maps / Firebase VITE_ exposure — PASS (public-key pattern + mitigations noted)
- Maps: `VITE_MAPS_API_KEY` client embed (`MapView.jsx:42-48` iframe `maps/embed/v1/search?key=`) + `MAPS_API_KEY` server proxy (`server.js:36,262,506-531`). This is the correct split — browser key is inherently public. Mitigations documented: `.env.example:25` "restrict key to HTTP referrers in Cloud Console", `MapView.jsx:33` "Key needs HTTP-referrer lock — see README deploy notes". Backend `fetchPlacesLive:262` `encodeURIComponent(MAPS_KEY)`, 6s abort, error surfaced as `places-fallback` + `e.message` (Google `status` string, no key).
- Firebase: `frontend/src/firebase.js:8-15` `VITE_FIREBASE_API_KEY` etc. — Firebase web apiKey is public by design; protection is Security Rules + App Check, not secrecy. `firebase.js:35` anonymous sign-in with surfaced errors (no swallow), `firebase.js:31-38` disabled cleanly without key. Rules gate on `request.auth != null` (see §8).

### 4. SMS provider handling — PASS (minor hardening below)
- `server.js:39-40` `SMS_PROVIDER` + `SMS_KEY` server-only, no frontend exposure. `smsConfig:281-293` gates live on provider+key, else `mock-log`. `sendSmsLive:294-331` MSG91 `authkey` in URL server-side only, DLT `SMS_DLT_TEMPLATE_ID` optional; Twilio Basic `sid:key` server-side only. Errors sliced to 120 chars (`308,327`), stored as `*-error` + `queued:true`, surfaced honestly (`549-552`).
- Mock path `539-542` returns `sent:false, queued:true, provider:mock-log, source:mock-log` — UI badges it (DiagnosisCard/SmsLog), no false "delivered" claim. No SMS key in logs (logs only `phone` + provider, `310,328,541`).

### 5. OWM / Agmarknet error surfacing, no leak — PASS
- Weather `100-139`: no-key → `source:mock`; key-present failure → `source:owm-error` + `error: errMsg` (e.g. `owm-401`) + note. Key stays in server URL (`110`), never echoed. `console.warn` logs status only.
- Mandi `200-248`: live gated on `AGMARKNET_KEY`, 6s abort, `agmarknet-live` on success; failure → `agmarknet-csv-fallback` + `liveError: e.message` (e.g. `agmarknet-401`) + honest stale warning. Key `encodeURIComponent` in server URL only (`205`). Unknown crop 404 with suggestions (`476-479`), never silent soybean.
- Frontend `api.js:4-14` preserves `{error}` body (200-char slice) — intentional error surfacing, no secret fields in contract.

### 6. CORS * — PASS for Day1, MUST restrict before pilot
- `server.js:20-22` `CORS_ORIGIN ? cors({origin: split}) : cors()` — open `*` is hackathon default, restriction wired and documented (`.env.example:58-59`, code comment). No `Access-Control-Allow-Credentials` with `*` misuse. Required fix: set `CORS_ORIGIN` in prod (see Required Fixes P1).

### 7. Diagnose size guard + Idempotency — PASS
- `server.js:23` `express.json({limit:"8mb"})` outer cap + `369` `imageBase64.length > 2_800_000 → 413` inner guard (~2MB binary) + client compress `api.js:18-33` 1024px jpeg 0.7 + frontend 12MB pre-check (`DiagnosisCard.jsx:49-52`) + MIME `image/` check (`45`). Defense in depth present.
- `server.js:362-364` `Idempotency-Key` required 400 + `idemCache` dedup `deduped:true`. `DiagnosisCard.jsx:19-26` `crypto.randomUUID()` + LAN fallback keeps header working on `http://192.168.x.x`. Note: `idemCache:43` unbounded Map — pilot needs TTL/LRU (P2).

### 8. Firestore rules auth!=null — PASS for Day1, MUST harden before pilot
- `firestore.rules:10-25` every collection gated `request.auth != null`; `mandiCache` write `if false` (server-only via Admin SDK — correct). File header + TODO explicitly: "Harden before pilot … do NOT pilot with current rules". Anonymous auth (`firebase.js:35`) means any client gets a uid — Day1 judging OK, pilot needs per-doc ownership + FPO claims (P0).

### 9. Prompt injection + disclaimer — PASS for MVP (hardening recommended)
- Disclaimer on every AI path: `server.js:413,463` `disclaimers(lang)` (KCC 1800-180-1551 + officer confirmation), rendered `DiagnosisCard.jsx:251`. Dosage always officer-gated (`382,396,407`).
- Bounding: `remedy.slice(0,500)`/`rawText.slice(0,800)`/`reply.slice(0,600)` (`395,407,441,448,455`), `history.slice(-6)` (`440,452`, `agriAdvise.js:38,61`), `confidence` coerced, `urgency` allowlisted (`397`). `stripCodeFence` prevents ```json wrapper breakage; `parseGeminiJson` throws with capped `rawText` (2000) instead of crashing.
- No explicit system-prompt injection filter / user-input sanitiser on `text`/`crop`/`history` — acceptable for MVP mock-first, recommend instruction-hierarchy + input caps before pilot (P2).

## Findings (OWASP category, severity, file:line)
- None Critical. None High blocking Day1.
- (M1, Medium, pre-pilot blocker — not Day1 FAIL) **A01 Broken Access Control — broad rules**: `firestore.rules:10-25` any authed (incl. anonymous) user can read/write all `users/farms/diagnoses/smsLog`. Documented TODO, but pilot-exploitable cross-user read/write. Fix before pilot (P0 below).
- (M2, Medium, pre-pilot blocker) **A05 Misconfiguration — CORS open by default**: `backend/server.js:22` `cors()` `*` when `CORS_ORIGIN` unset. Documented hackathon default; prod with `*` allows any origin to call live Gemini/places/SMS-spend endpoints. Fix via env (P1).
- (M3, Medium, pre-pilot blocker) **A04 Insecure Design / A07 Availability — no rate limiting**: no `express-rate-limit` on `POST /api/diagnose`, `/api/chat`, `/api/sms/log`, `GET /api/weather|mandi|nearby`. Live Gemini/OWM/Places/SMS are costed APIs — anonymous clients can burn quota. Fix before pilot (P1).
- (L1, Low) **A05 — missing security headers**: no `helmet` (HSTS/X-Content-Type-Options/frame-ancestors/CSP) in `backend/server.js:19-23`. SPA served same-origin; iframe map is Google embed. Add `helmet` before pilot (P2).
- (L2, Low) **A03 Injection / A04 — unbounded inputs**: `POST /api/chat` `server.js:428` `text`/`history` length unchecked (aka prompt-token burn + injection surface); `POST /api/diagnose` `crop` free-form into prompt (`389`); `POST /api/sms/log` `phone` unvalidated (`535` default placeholder, `To: phone` passed to Twilio `318`, MSG91 digit-strip `301` only). Add caps + phone allowlist before pilot (P2).
- (L3, Low) **A07 — unbounded idempotency cache**: `backend/server.js:43` `idemCache` Map never evicted — slow-memory DoS on long-lived Cloud Run. Add TTL/LRU (P2).
- (L4, Low) **A09 Logging — phone numbers in logs**: `server.js:310,328,541` logs destination phone. Low sensitivity vs keys, but PII — redact/mask before pilot (P3).
- (L5, Info) **A06 Vulnerable Components**: no lockfile audit in scope; `frontend` build PASS (vite 5.4.21). Recommend `npm audit` + Dependabot before pilot (P3).

## Required Fixes (for dev agents — none blocking Day1 demo; all required before pilot)
- [ ] **P0 — Firestore ownership (M1)**: replace open `auth!=null` with owner checks, e.g. `allow read, write: if request.auth != null && request.auth.uid == resource.data.uid` + FPO custom claims per `firestore.rules:6-8` TODO. Add rules unit tests. Do NOT pilot with current rules.
- [ ] **P1 — CORS lock (M2)**: set `CORS_ORIGIN=https://<hosting-domain>,https://<run-domain>` in prod env; verify preflight rejects unknown origin. Keep `*` only for local/hackathon. File: `backend/server.js:20-22`, `.env.example:58-59`.
- [ ] **P1 — Rate limiting (M3)**: add `express-rate-limit` (e.g. diagnose 10/min/IP, chat 20/min/IP, sms 5/min/IP, weather/mandi 60/min/IP), return 429 JSON. Files: `backend/server.js:359,427,534,492,472`.
- [ ] **P2 — Headers (L1)**: add `helmet({contentSecurityPolicy, hsts, frameguard})`; verify `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, no `X-Powered-By`. File: `backend/server.js:19-23`.
- [ ] **P2 — Input caps + phone validation (L2)**: chat `text.slice(0,500)` + `history` max 6 items × 300 chars; diagnose `crop` allowlist 10 crops (reuse mandi list); sms E.164 `/^\+91[6-9]\d{9}$/` 400 on invalid, `message.slice(0,320)` keep. Files: `backend/server.js:366,428,535`.
- [ ] **P2 — Idempotency TTL (L3)**: evict `idemCache` after 24h / cap 1000 entries (LRU). File: `backend/server.js:43,363-364`.
- [ ] **P3 — PII + supply chain (L4/L5)**: mask phone in logs (`+91-XXXXXX1234`); run `npm audit` backend+frontend, enable Dependabot, pin `gemini-1.5-flash` model version.
- [ ] **P3 — Key hygiene docs**: document Maps referrer-lock + Firebase App Check + key rotation steps in README deploy notes (follow-up to code-review mentoring note). No code change.

## Threat Model (STRIDE, real-first scope)
- Spoofing: anonymous Firebase auth — rules `auth!=null` only proves "signed in", not identity. Mitigated Day1 by mock data; P0 ownership needed for pilot.
- Tampering: Admin SDK server-side only; `mandiCache` write `false`; diagnose `persist` via `saveDiag` server-side. Client cannot write `mandiCache`. PASS.
- Repudiation: `[gemini]/[weather]/[mandi]/[places]/[sms]/[firestore]` prefixed server logs + `smsLogMem`/`diagnosesMem` audit entries + `source` flags. PASS.
- Information Disclosure: keys server-only (see §2/4/5); `VITE_` limited to public keys; error `detail`/`liveError` expose status strings only, sliced. PASS.
- Denial of Service: size guards + singleflight/TTL + aborts present; missing rate-limit/helmet/idem-TTL → P1/P2. Partial.
- Elevation of Privilege: least-privilege gap is M1 broad rules; least-privilege OK elsewhere (server holds keys, client holds none). Partial — P0.

## Verification Performed (read-only)
- Read `.ai/reports/qa-realfirst.md`, `.ai/reports/code-review-realfirst.md`, `.env.example`, `.gitignore`, `firestore.rules`, `backend/server.js` (579 lines), `backend/genkit/agriAdvise.js`, `frontend/src/firebase.js`, `frontend/src/lib/api.js`, `frontend/src/components/SourceBadge.jsx`, `MapView.jsx`, `DiagnosisCard.jsx`.
- Grep `VITE_|AIza|sk-|serviceAccount|BEGIN PRIVATE|innerHTML|dangerouslySetInnerHTML|eval\(|helmet|rate-limit|Idempotency` across backend+frontend.
- `git status --porcelain`, `git ls-files | grep env|serviceAccount|key.json`, `git log` (zero commits), `git check-ignore -v .env backend/.env frontend/.env` (all ignored).
- No app code modified (audit-only per hard boundary).

---
Security Engineer: audit only, no app-code changes made.
