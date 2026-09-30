# Security Audit — KisaanMitra Redesigned UI (Khet Monsoon)
Verdict: PASS
Date (UTC): 2026-09-30 | Auditor: security | Scope: `D:\Build with AI\frontend` only
Inputs: `.ai/reports/qa-report-ui.md` (PASS) + `.ai/reports/code-review-ui.md` (APPROVED)
Build: `vite v5.4.21` (QA 1.45s / review 1.40s) — not rebuilt by security (audit-only boundary).

## Scope & Method
- Static review of `index.html`, `src/App.jsx`, `src/index.css`, `src/firebase.js`, `src/main.jsx`, `src/lib/api.js`, `src/components/DiagnosisCard.jsx`, `ChatBox.jsx`, `WeatherMandi.jsx`, `MapView.jsx`, `SmsLog.jsx`, `package.json`, `vite.config.js`, `tailwind.config.js`.
- Grep checks: `dangerouslySetInnerHTML|innerHTML|eval|new Function` → 0 hits; `target=_blank|rel=` → 1 site (`MapView.jsx:69-70`); `VITE_|apiKey|secret|createObjectURL` → env-only + 2 object-URL sites; `google.com/maps|encodeURIComponent|iframe|https://` → Maps embed + directions only.
- No code or config modified (audit-only). No `dist/` runtime DAST, no `npm audit`, no git-history secrets scan — noted as follow-ups for devops/backend.

## Findings (OWASP category, severity, file:line)

### PASS — No critical / high / medium
1. **A03 Injection / A07 XSS — PASS** — No `dangerouslySetInnerHTML`, no `innerHTML`, no `document.write`, no `eval`/`new Function` in `src/`.
   - `SmsLog.jsx:70` `{s.message}` React text (backend SMS body rendered as text, not HTML) — XSS neutralized even if backend stores attacker input.
   - `ChatBox.jsx:98` `{m.text}` React text + `style whiteSpace:pre-wrap` (no HTML parsing) — backend `reply/disclaimer` safe.
   - `DiagnosisCard.jsx:207,225,228,230` `{out.disease/remedy/dosage/disclaimer}` + `WeatherMandi.jsx:81` `{mandiErr}` + `ChatBox.jsx:162` `{voiceHint}` + `DiagnosisCard.jsx:179` `{err}` — all React text in `role=alert`/`aria-live`, no HTML injection.
   - `MapView.jsx:68` directions `href={...destination=${encodeURIComponent(p.name + " mandi")}...}` — backend-controlled `p.name` correctly encoded; `origin=${coords.lat},${coords.lon}` numeric state only. `WeatherMandi.jsx:23` `` `/api/mandi?crop=${crop}` `` — `crop` from allowlisted `CROPS` state, not free text. `lib/api.js:10` error `txt.slice(0,200)` rendered as text only.
2. **A02 Cryptographic Failures / Secrets — PASS** — No hardcoded secrets.
   - `firebase.js:7-12` all `import.meta.env.VITE_FIREBASE_*`, gated `if (cfg.apiKey)` else mock mode — safe without keys, no key in repo.
   - `MapView.jsx:9` `VITE_MAPS_API_KEY` env only; list-mode fallback when absent (`MapView.jsx:43-47`). Embed key in client URL (`MapView.jsx:40`) is expected for Maps Embed API — requires HTTP-referrer lock (already noted `M3` comment line 30). No `VITE_*` values committed; no `.env` in `frontend/` listing.
   - External URLs all `https://` (`index.html:9-10` fonts, `MapView.jsx:40,68` google.com/maps). No `http://` fetch; dev-only `http://localhost` proxy target in `vite.config.js:8-9` is dev-server only, not shipped.
3. **Fonts via Google CDN — PASS (acceptable)** — `index.html:9-14` `preconnect fonts.googleapis.com/fonts.gstatic.com crossorigin` + `css2?family=Baloo+2/Mukta/IBM Plex Mono&display=swap`. No SRI (Google Fonts rotates CSS, SRI impractical — industry standard). Privacy: standard Google Fonts request (IP + UA to Google); acceptable for hackathon. No `@import` of untrusted CSS, no font `eval`.
4. **A01 Broken Access Control — PASS (frontend scope)** — No auth bypass in client. `DiagnosisCard.jsx:68` `farmId:"farm-1"` hardcoded demo simplification (info, backend must enforce farm ownership — not frontend-enforceable). No IDOR params, no role checks in client to bypass. `firebase.js:20` `signInAnonymously().catch(()=>{})` — anonymous only, no privilege elevation.
5. **Target `_blank` — LOW (hardening, not blocking)** — `MapView.jsx:66-74` `target="_blank" rel="noreferrer"` missing explicit `noopener`.
   - Modern browsers treat `noreferrer` as implying `noopener` (reverse-tabnabbing mitigated), but FAANG baseline is `rel="noopener noreferrer"`. No `window.opener` usage elsewhere. Severity: low.
6. **Object-URL leak — LOW (availability / memory, not blocking demo)** — `DiagnosisCard.jsx:51` `setPreview(URL.createObjectURL(f))` never `revokeObjectURL`; `lib/api.js:31` `img.src = URL.createObjectURL(file)` never revoked.
   - Repeated diagnoses grow blob URL table (soak / low-end device DoS). No user-data leak (blob URLs same-origin, not exfiltrated). Severity: low — matches QA low `DiagnosisCard.jsx:51,63-64` + review concurrence.
7. **A05 Misconfiguration / Clickjacking / CSP — PASS with notes** — No `X-Frame-Options`/`CSP` in frontend (backend `server.js` serves `dist/` — header responsibility is backend/devops). No inline `on*=` handlers, React synthetic events only. `MapView.jsx:37-42` `iframe title=... loading=lazy` Google Embed trusted; no `sandbox` needed for Maps Embed (would break). No `allow=` over-permissive. `index.html:15` `data:` SVG favicon (emoji 🌾) — safe, no script.
8. **A04 Insecure Design / Input validation — PASS** — `DiagnosisCard.jsx:42-49` `f.type.startsWith("image/")` + `f.size > 12MB` reject with Hindi guidance; `accept="image/*"` + server 413/8MB guard preserved (`DiagnosisCard.jsx:78-79`). Dropzone keyboard `Enter/Space` (`DiagnosisCard.jsx:131-136`), drag `preventDefault`. `ChatBox.jsx:33` `trim()` + `if (!t||busy) return`, history `slice(-6)`. `WeatherMandi.jsx:20-29` H1 404 guard → `भाव उपलब्ध नहीं` (no stale price). Geolocation `timeout:5000` + silent Indore fallback (`MapView.jsx:17-21`) — integrity note, not vuln.
9. **A09 Logging / Info disclosure — PASS** — `lib/api.js:4-13` preserves `{error}` + `suggestions` (e.g. `unknown crop (try: …)`) sliced to 200 chars, rendered as text — no stack, no PII, no Firebase key. `MapView.jsx:78-80` footer `lat,lon toFixed(3)` (~100m precision, acceptable for mandi demo; do not increase precision). `console.*` — none found in `src/`. SMS `phone/createdAt` rendered as text (`SmsLog.jsx:67-68`).
10. **CSRF — PASS (not applicable, defense-in-depth present)** — `POST /api/diagnose|/api/sms/log|/api/chat` JSON + `Idempotency-Key: newId()` custom header (`DiagnosisCard.jsx:67`) forces CORS preflight, defeating simple-form CSRF. No cookies observed in frontend; Firebase ID-token (if used by backend) is `Authorization` header, not cookie — SameSite/CSRF token not required. No state-changing `GET`.
11. **A06 Vulnerable Components — PASS (no new attack surface)** — `package.json:10-20` `react/react-dom ^18.3.1, firebase ^10.12.0, vite ^5.4.0, tailwind 3.4.7` — no axios/UI/chart libs added (QA verified). No `npm audit` run by security (boundary); recommend CI `npm audit` + Dependabot (see Required Fixes). No vendored JS.
12. **A08 Integrity / A10 SSRF — PASS / N/A (frontend)** — No `<script src=...>` third-party (only `src/main.jsx` module + fonts CSS). Backend `/api/weather?lat&lon`, `/api/mandis/nearby?lat&lon` server-side fetches are backend SSRF scope — frontend passes numeric coords only; no URL allowlist bypass from client. Recommend backend allowlist + IMDSv2/egress notes (out of frontend scope).
13. **a11y focus — PASS (security-adjacent: phishing/consent clarity)** — `index.css:81-85` `:where(a,button,input,select,textarea,[tabindex]):focus-visible {outline:3px solid #1d6fd8}`; `skip-link App.jsx:37 → #nidan` (`index.css:199-213` offscreen-until-focus); `aria-live polite/assertive` + `role=alert` correct (`ChatBox:82,158`, `DiagnosisCard:178,188,205`, `WeatherMandi:80`, `SmsLog:42`). `lang="hi"` static (`index.html:2`) never flips on EN toggle — screen-reader spoofing/confusion low (QA low, not vuln).
14. **Reduced-motion — PASS** — `index.css:219-228` `@media (prefers-reduced-motion: reduce)` kills `animation/transition`, `.ticker-track {animation:none; flex-wrap:wrap}`, `.scan-box::after {display:none}`. No vestibular-trapping animation; mic `pulse-ring` covered by global `*` override.

## Required Fixes (for dev agents — all LOW/INFO, non-blocking; no FAIL loop)
1. [low] **Revoke object URLs** — `DiagnosisCard.jsx:51` + `lib/api.js:31`: `const u = URL.createObjectURL(f); setPreview(u); return () => URL.revokeObjectURL(u)` on `pick`/unmount; in `compressImage` `img.onload` → `URL.revokeObjectURL(img.src)` after decode + `onerror` revoke. Prevents soak OOM on repeated diagnoses.
2. [low] **Harden `_blank`** — `MapView.jsx:70` `rel="noreferrer"` → `rel="noopener noreferrer"` (explicit, FAANG baseline; `noreferrer` already implies `noopener` but be explicit).
3. [info] **Maps key hygiene** (devops/backend): keep `VITE_MAPS_API_KEY` HTTP-referrer-locked (per `MapView.jsx:30` comment), rotate if ever committed; never embed secret (non-Maps) keys in `VITE_*`.
4. [info] **Backend headers** (devops, not frontend edit): when serving `dist/`, add `Content-Security-Policy (default-src 'self'; img-src 'self' data: blob:; font-src fonts.gstatic.com; style-src 'self' fonts.googleapis.com; frame-src www.google.com; connect-src 'self')`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options: SAMEORIGIN`. Frontend already compatible (no inline scripts, fonts + Maps only).
5. [info] **A11y-correctness follow-ups** (backlog, 3pts per review): `useEffect(() => document.documentElement.lang = lang)` (`App.jsx:32` + `index.html:2`), `📍 Indore (default)` label (`MapView.jsx:18-21`), chip/toggle 44px (`index.css:65`, `App.jsx:71,78`, `MapView.jsx:67`, `SmsLog.jsx:33`), farm selector replacing `farmId:"farm-1"` (`DiagnosisCard.jsx:68`).
6. [info] **Supply-chain** (CI): add `npm audit --audit-level=high` + Dependabot/Snyk daily, `gitleaks` pre-commit + CI (no secrets found today, keep it that way); rebuild `dist/` before any deploy (stale hash `index-BqtgCYW4.js` risk per QA).

## Threat Model (STRIDE — frontend slice)
- Spoofing: anonymous Firebase only; no login to spoof. Maps/SMS display names from backend rendered as text — no impersonation via HTML.
- Tampering: `Idempotency-Key newId()` + crypto fallback (M4) prevents double-diagnose replay; TLS (https fonts/Maps) protects in transit.
- Repudiation: backend `/api/sms/log` is audit trail; frontend `SmsLog.jsx:9-23` 10s poll + visibility pause (M7) preserves evidence without log spam.
- Info disclosure: error bodies sliced + text-only; coords truncated to 3 decimals; no PII in client logs.
- DoS: object-URL leak (low) + 12MB client guard + compress 1024px/0.7 mitigate upload DoS; ticker/scan CSS-only (no JS loop DoS).
- EoP: `farm-1` hardcoded — backend must authorize farm access; client adds no privilege.

## Security Checklist
- [x] Input validation (type + 12MB + allowlisted crops, encodeURIComponent directions)
- [x] Authentication/Authorization (anonymous only, no bypass; farmId backend scope)
- [x] Data encryption (https only, no mixed content, no client crypto roll-your-own)
- [x] No SQL injection surface (no string SQL; backend ORM scope)
- [x] XSS prevention (React text only, 0 innerHTML)
- [x] CSRF (JSON + custom header preflight; no cookie auth in client)
- [x] Security headers (deferred to backend serving `dist/` — recommendation given)
- [x] Error handling (Hindi guidance, no stacks, role=alert, text-only)
- [x] No secrets (env-only, gated init, list-mode fallback)
- [x] `_blank` (noreferrer present, add noopener explicitly)
- [x] Maps links (encoded, numeric origin, referrer-lock note)
- [x] a11y focus + skip-link + live regions
- [x] Reduced-motion kill-switch

**Chain:** forward this + `qa-report-ui.md` + `code-review-ui.md` to `devops` ONLY on explicit user `deploy/release/ship`. No auto-deploy. No fix loop (0 blocking, max 3 cycles not triggered).
