# Security Audit — KisaanMitra MVP (Agri, deadline 30 Sept 2026)
**Auditor:** security | **Date (UTC):** 2026-09-29
**Inputs read:** `D:\Build with AI\.ai\reports\qa-report.md` (QA v1 PASS) + `D:\Build with AI\.ai\reports\code-review.md` (dev-lead APPROVED) + direct spot-check of `backend/server.js`, `backend/genkit/agriAdvise.js`, `backend/Dockerfile`, `firestore.rules`, `frontend/src/App.jsx`, `frontend/src/lib/api.js`, `frontend/src/components/DiagnosisCard.jsx`, `ChatBox.jsx`, `WeatherMandi.jsx`, `MapView.jsx`, `SmsLog.jsx`, `frontend/src/firebase.js`, `frontend/vite.config.js`, `backend/data/seed.json`, `backend/data/agronomy_brief.md`, `.env.example`, `.gitignore`, `firebase.json`, `README.md`
**Mode:** mock=true (no live keys) | **Scope:** hackathon MVP demo, single-service Cloud Run shape. NOT a pilot/prod sign-off.

Verdict: PASS

> PASS for hackathon demo / video / deck in mock mode. No critical blockers requiring a dev fix cycle before judging (0/3 cycles consumed). All pilot/prod hardeners below are MUST-FIX before any real farmer data or public deploy — do NOT pilot with Day1 posture.

---

## 1. OWASP Quick Wins (task checklist)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | Secrets in client/dist (`.env.example` only?) | PASS | `glob **/.env*` → only `.env.example` (empty values). No `.env` in repo. `.gitignore:3 .env`, `:4 frontend/dist/` correct. `grep AIza\|GEMINI_\|sk-` in `frontend/src` → only `MapView.jsx:8 import.meta.env.VITE_MAPS_API_KEY` env read + `App.jsx:28` display string `Gemini 1.5 Flash` (not a key). `backend` grep clean (keys via `process.env` only). QA dist scan clean stands. |
| 2 | Firestore rules `auth!=null` Day1 + TODO | PASS (Day1) / PILOT-BLOCKER | `firestore.rules:11,14,17,24` `auth!=null`, `:20-21 mandiCache write:false` correct. `:4-9` explicit `TODO(pilot)` owner-check example + `do NOT pilot` comment. Correct hackathon/pilot split. See Finding S2. |
| 3 | CORS `*` | PASS (Day1) / PROD-BLOCKER | `backend/server.js:18-20` `CORS_ORIGIN ? cors({origin: split}) : cors()` — hackathon `*` default, prod env-ready. README documents. Acceptable Day1, must set `CORS_ORIGIN` prod. See S3. |
| 4 | Diagnose upload size guard 2.8M | PASS | `server.js:21` `express.json 8mb` outer + `:138-139` `>2_800_000 chars (~2MB) → 413` with compress hint. Client `api.js:18-33 compressImage 1024px jpeg0.7` pre-POST. Flash limit / OOM mitigated Day1. |
| 5 | lat/lon validation | PASS | `server.js:209-216` range check `lat -90..90 lon -180..180 → 400`, missing → Indore default (backward compat). `mandis/nearby:224` `Number()` coerces (NaN → mock default, acceptable Day1 list fallback). |
| 6 | Idempotency-Key dedup | PASS | `server.js:132-134` required + `idemCache` dedup `deduped:true` (QA verified). Client `DiagnosisCard.jsx:7-12 newId()` `crypto.randomUUID` + `Date.now()+random` fallback keeps retry on insecure-LAN `http`. In-memory map only (single-instance Day1 — note prod needs Redis/Firestore, see S6). |
| 7 | Maps key restriction note | PASS (docs-only, Day1) | `MapView.jsx:30` dynamic `q=mandi+near+lat,lon`, key via `VITE_MAPS_API_KEY` only. `README:67` referrer-lock steps documented, not enforced in code (cannot enforce client-side). Acceptable Day1; must lock before any public URL. See S4. |
| 8 | Auth anonymous | PASS (Day1) | `frontend/src/firebase.js:16-21` skips init without `VITE_FIREBASE_API_KEY`; `signInAnonymously().catch(()=>{})` only when configured. Mock runs with `auth=db=null` (no crash). No privilege escalation (anon has no claims; rules still require `auth!=null`). Backend `/api/*` intentionally unauthenticated Day1 (mock data only) — must add Firebase ID-token check pre-pilot (S2). |
| 9 | SMS log injection | PASS (Day1, Low hardening noted) | `server.js:238-244` `message.slice(0,320)` truncation verified; `phone` default masked. Render `SmsLog.jsx:27 {s.phone}: {s.message}` via React text (no `dangerouslySetInnerHTML`/`innerHTML`/`eval` — grep clean), so stored-XSS neutralised. Residual: `phone` unvalidated + `console.log[phone+message]` log-forging (newlines) + no rate limit (spam). Low Day1 (in-memory mock), fix pre-pilot. See S5. |
| 10 | Genkit prompt injection disclaimer | PASS (Day1, Low hardening noted) | `agriAdvise.js:19-22` disclaimers Hi/En + `server.js:163,189` returned every chat/diagnose + `DiagnosisCard:63` amber box + `ChatBox:20 ⚠️` + `App.jsx:28` footer KCC `1800-180-1551`. Prompts `buildDiagnosePrompt:30-31` RAG-first + `suspected` + label/officer dosage rule + `buildChatPrompt:39-41` `<=70 words`. Residual: `Farmer: ${text}` + `history` concatenated unsanitised (jailbreak `ignore instructions` possible), no input length cap server-side, live path `JSON.parse` fallback. Acceptable mock Day1 (output always carries disclaimer); harden pre-pilot. See S7. |

## 2. Hard Secret / PII / Safety Verification

- **No hardcoded keys:** PASS. All secrets env-driven (`GEMINI_API_KEY`, `OPENWEATHER_API_KEY`, `MAPS_API_KEY`/`VITE_MAPS_API_KEY`, `VITE_FIREBASE_*`, `FIREBASE_PROJECT_ID`/`GOOGLE_APPLICATION_CREDENTIALS`, `CORS_ORIGIN`). `grep` backend+frontend for `AIza|sk-|password|secret="..."` clean (1 benign env-read hit only).
- **No PII leak:** PASS. `backend/data/seed.json` is mock only: `Ramesh Patel / +91-98XXX-XXXX1 / Sanwer, Indore / farm-1 soybean 2.5ac` — masked phone, demo names. No Aadhaar/bank/real phone. `sms/log` default phone masked. No analytics/trackers. Mock diagnoses stay in-memory (`diagnosesMem`/`smsLogMem`), Firestore save best-effort noop without creds (`server.js:106-113`).
- **Hindi disclaimer + KCC helpline:** PASS everywhere. `agriAdvise.js:19-22` `सलाह केवल संकेतात्मक है — छिड़काव से पहले कृषि अधिकारी से पुष्टि करें। KCC: 1800-180-1551।` + EN twin. Returned in both APIs, rendered in `DiagnosisCard` amber box, appended in `ChatBox`, footer `App.jsx:28`, `agronomy_brief.md:7,26-28` safety + `>30% → KCC`. QA verified Hi+En live.
- **XSS:** PASS Day1. `ChatBox.jsx:55 {m.text}` + all cards use React text rendering; `grep dangerouslySetInnerHTML|innerHTML|eval\(` clean. QA injection `<script>alert(1)</script> '; DROP...` JSON-escaped, no crash, no SQL (no DB). Pre-pilot: add output-encoding test (QA note stands).
- **`.env` hygiene:** PASS. Only `.env.example` committed (all empty). `.gitignore` covers `.env`, `dist/`, `frontend/dist/`, `node_modules/`. No secrets in git history claimed (no `.env` found to scan; recommend `gitleaks` pre-push — S8).

## 3. OWASP Top 10 (2021) Mapping — MVP Posture

1. **A01 Broken Access Control — MEDIUM (Day1 accepted, pilot-blocker).** Rules `auth!=null` lets any signed-in user read/write any `users/farms/diagnoses/smsLog`; backend `/api/*` has no auth at all. OK for mock demo (no real data), NOT for pilot. → S2.
2. **A02 Cryptographic Failures — PASS (Day1).** No crypto rolled; TLS delegated to Hosting/Cloud Run; no passwords/secrets stored. No HSM/KMS needed Day1.
3. **A03 Injection — LOW.** No SQL (CSV + in-memory). Command/LDAP/XPath none. Prompt injection residual (S7) + SMS log-forging (S5) are Low Day1. XSS neutralised via React text.
4. **A04 Insecure Design — PASS (Day1).** Abuse cases covered: wrong-crop 404 (H1), API 404 JSON (M2), image 413 (L4), lat/lon 400 (L2), idempotent retry, weather singleflight. Threat-model next step pre-pilot (STRIDE §5).
5. **A05 Security Misconfiguration — LOW (Day1 accepted).** CORS `*` default, no `helmet` headers (`HSTS/X-Content-Type-Options/X-Frame-Options`), `express.json 8mb`, verbose `502 {detail: e.message}` info-disclosure. OK hackathon, lock prod. → S3.
6. **A06 Vulnerable Components — LOW/INFO.** `express ^4.19.2`, `genkit ^1.0.0`, no lockfile audit/SBOM/Dependabot in scope. No known-critical action Day1; add `npm audit` + Dependabot pre-pilot. → S8.
7. **A07 Auth Failures — LOW (Day1).** Anonymous-only, no sessions/JWT/passwords to break; no rate limiting on `/api/chat|diagnose|sms` (spam/abuse possible once public). Add rate limit + Firebase ID-token verify pre-pilot. → S2/S6.
8. **A08 Integrity Failures — INFO.** No signed builds/SLSA Day1; multi-stage Dockerfile deterministic from `package*.json`; `csv/brief` static with source labels (`agmarknet-static-csv`, `mock-static`). Fine hackathon.
9. **A09 Logging/Monitoring Failures — INFO.** `console.log [SMS mock]`, `[firestore] skip`, `[genkit] skip` sufficient demo audit (`GET /api/sms/log` last-20). No SIEM/PII-redaction needed Day1; add structured logs + retention pre-pilot.
10. **A10 SSRF — PASS.** No user-controlled fetch URL. `fetchWeather` builds fixed `api.openweathermap.org` URL with numeric lat/lon + env key; Maps embed fixed `google.com/maps/embed/v1/search` with numeric query. Validated ranges block abuse.

## 4. Findings (OWASP category, severity, file:line)

- **S1 — INFO — Verbose error detail (`A05`). `backend/server.js:170,190` `res.status(502).json({error, detail: e.message})`.** Leaks internal messages (e.g. Gemini/OWM errors) to client. Day1 harmless (demo debugging), prod should log server-side + return generic `उपलब्ध नहीं`. No fix cycle.
- **S2 — MEDIUM (pilot-blocker, NOT demo-blocker) — Coarse authz + open APIs (`A01/A07`). `firestore.rules:10-25` any-auth read/write + `backend/server.js:130-249` no Firebase ID-token check.** Any authed user can read/write others' farms/diagnoses; anyone can POST diagnose/chat/sms. Accepted Day1 (mock data, acknowledged TODO). Pre-pilot: `request.auth.uid==resource.data.uid` + FPO claims + `verifyIdToken` middleware + per-user `farmId` ownership.
- **S3 — MEDIUM (prod-blocker, NOT demo-blocker) — Permissive CORS + missing hardening headers/rate-limit (`A05/A07`). `backend/server.js:18-21`.** `*` default + no `helmet` + no `express-rate-limit`. Accepted hackathon; prod: set `CORS_ORIGIN=https://<hosting>,https://<run>` + `helmet()` + `rateLimit({chat:30/min, diagnose:15/min, sms:10/min})` + `HSTS`.
- **S4 — LOW — Maps key exposure scope (`A05`). `frontend/src/components/MapView.jsx:35-37` key in `iframe src`.** Unavoidable for Embed API (public key), mitigated only by Cloud Console HTTP-referrer lock (README-documented). Pre-public-URL: lock referrers + quota cap + rotate if leaked. No code change now.
- **S5 — LOW — SMS endpoint unvalidated + log forging (`A03`). `backend/server.js:238-244`.** `phone` free-text (no E.164 check), `message` keeps newlines/control chars into `console.log` + stored log. Stored-XSS safe (React text), but log injection + spam possible. Pre-pilot: `phone /^\+91[6-9]\d{9}$/ → 400`, strip `\r\n` control chars, `rateLimit`, DLT template allowlist.
- **S6 — LOW — Ephemeral idempotency/dedupe (`A04/A07`). `backend/server.js:32`.** `idemCache Map` in-memory: lost on restart/scale-out → duplicate diagnoses billed twice on Cloud Run multi-instance. Day1 fine (demo scale). Pre-pilot: Firestore/Redis-backed dedupe with TTL (24h) + `Idempotency-Key` UUIDv4 validation.
- **S7 — LOW — Prompt-injection surface (`A03/A04`). `backend/genkit/agriAdvise.js:35-42` + `backend/server.js:186`.** `Farmer: ${text}` + `history.slice(-6)` unsanitised into Gemini prompt; no server-side input cap (`chat` truncates only in mock reply `slice(0,80)`); live `JSON.parse` fallback accepts free text. Always disclaimed (defence-in-depth holds Day1). Pre-pilot: 500-char cap + role-separated `system/user` messages + JSON-schema validation + dosage allowlist + abuse log.
- **S8 — INFO — Supply-chain hygiene (no action now).** No `npm audit`/Dependabot/SBOM/`gitleaks` in repo. Pre-push: run `gitleaks detect`, `npm audit`, enable Dependabot; pre-pilot: pin + SBOM (CycloneDX).

**No HIGH or CRITICAL findings for mock demo scope.** QA H1-H3 + M1-M7 already fixed and spot-verified (code-review §Fix verification). No new code defects introduced.

## 5. Threat Model (STRIDE, Day1 quick-pass)

- **Spoofing:** anon auth only; no sessions to hijack. Pilot needsverified `uid` + FPO claims (S2).
- **Tampering:** CSV/brief static, labelled sources; `mandiCache write:false` server-only. Client `crop` param validated server-side (H1 404). OK.
- **Repudiation:** `Idempotency-Key` + `smsLogMem` last-20 + `createdAt/model` fields give demo audit trail. Pilot needs append-only Firestore + actor `uid`.
- **Information Disclosure:** no real PII/keys; verbose 502 `detail` is only leak (S1 Low).
- **Denial of Service:** `8mb` + `2.8M` 413 + weather cache/singleflight resist demo stampede. No rate limit — public deploy without S3 would be abusable.
- **Elevation of Privilege:** coarse `auth!=null` is the privilege boundary gap (S2); least-privilege owner checks required pilot.

## 6. Required Fixes (for dev agents)

**NONE blocking judging — 0 fix cycles consumed (max 3). Do NOT hold video/deck for code.**

Pre-pilot / pre-public-deploy MUST-FIX (in priority order, dispatch with this report path when pilot starts):
1. **S2 Authz+Auth:** `firestore.rules` owner checks + FPO claims; `server.js` `verifyIdToken` on `/api/diagnose|chat|sms/log`; bind `farmId→uid`. Owner: backend. Test: authed-A cannot read authed-B farm → 403.
2. **S3 Prod hardening:** `CORS_ORIGIN` set; `helmet()`; `express-rate-limit` per-route; generic 502 messages. Owner: backend. Test: `curl -H Origin:evil` blocked; `100 chat/min` → 429; headers present.
3. **S5 SMS validation:** E.164 `+91` check + control-char strip + rate limit + DLT template. Test: `phone:bogus → 400`, newline payload logged single-line.
4. **S6 Dedupe persistence:** Firestore/Redis idempotency store + TTL. Test: restart → same key still `deduped:true`.
5. **S7 Prompt hardening:** input cap + system/user separation + JSON-schema + dosage allowlist. Test: `ignore instructions` jailbreak still returns schema + disclaimer.
6. **S1/S8 Hygiene:** generic errors prod; `gitleaks` + `npm audit` + Dependabot + Maps referrer lock + quota.

## 7. Chain

- Read: `.ai/reports/qa-report.md` (PASS) + `.ai/reports/code-review.md` (APPROVED).
- Wrote: `.ai/reports/security-audit.md` (this file).
- Next: STOP — `devops` deploy ONLY on explicit user `deploy/release/ship` keyword (DEPLOY GATE). Video/deck owners proceed per code-review §Remaining must-fix.
- Fix loops: 0/3 consumed. If pilot starts, re-dispatch S2+S3 to dev with this report path, then re-audit.

---
**Security Engineer sign-off:** PASS for hackathon demo in mock mode (no secrets/PII leak, disclaimers+KCC everywhere, OWASP quick wins verified, residual risks Low/Medium Day1-accepted with pilot blockers documented). Report path: `.ai/reports/security-audit.md`.
