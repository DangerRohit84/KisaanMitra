# QA Report — KisaanMitra Redesigned UI (Khet Monsoon)
Verdict: PASS
Date (UTC): 2026-09-30 | Scope: `D:\Build with AI\frontend` | Theme: Khet Monsoon, Baloo2/Mukta/Plex Mono, diagnosis-first grid, ticker, scanline, 56px mic, Hindi-first
Prior state: junior-dev implemented, claimed `build PASS 1.49s`. This QA re-verified from clean `vite build`.

## Tests Run
### 1. Build — PASS
- Given clean `frontend/`, When `npm run build`, Then `vite v5.4.21 built in 1.45s` (37 modules, `index-BqtgCYW4.js 171.06 kB / gzip 55.63 kB`, `index-D3hKO6gj.css 25.30 kB / gzip 5.87 kB`). Matches claimed 1.49s within variance. `dist/index.html` Hindi title + fonts intact.
- No build warnings/errors. `vite.config.js` proxy `/api` unchanged (env-overridable `VITE_API_TARGET`, fallback `BACKEND_PORT/PORT/8080`).

### 2. Dependencies — PASS (no new deps)
- `frontend/package.json` deps: `firebase ^10.12.0, react ^18.3.1, react-dom ^18.3.1`; dev: `@vitejs/plugin-react, autoprefixer, postcss, tailwindcss@3.4.7, vite ^5.4.0`. No axios/UI/chart libs added. Redesign is pure Tailwind + CSS (`tailwind.config.js` extends `khet/halid/mitti/monsoon`, `fontFamily display/body/mono`, keyframes ticker/scan/pulse-ring/shimmer/floaty). Verified via `Get-Content frontend/package.json`.

### 3. /api Contract — PASS (unchanged, 1:1 with backend)
- Frontend calls found (`grep /api/`): `POST /api/diagnose`, `POST /api/sms/log`, `GET /api/sms/log`, `POST /api/chat`, `GET /api/weather?lat&lon`, `GET /api/mandi?crop=`, `GET /api/mandis/nearby?lat&lon`.
- Backend `server.js` routes: `GET /api/health`, `GET /api/seed`, `POST /api/diagnose` (Idempotency-Key required), `POST /api/chat`, `GET /api/mandi` (404 `unknown crop` + suggestions), `GET /api/weather` (1h cache + singleflight), `GET /api/mandis/nearby`, `POST+GET /api/sms/log`. All frontend paths resolve. `WeatherMandi.jsx:20` correctly handles 404 bogus-crop → `भाव उपलब्ध नहीं` (H1 guard). `lib/api.js` preserves backend `{error}` body (L3 fix) — callers see `unknown crop (try: …)`.

### 4. Hindi-first Copy — PASS
- `index.html lang="hi"`, meta `किसानमित्र — पत्ती दिखाओ, उपाय पाओ`, default `useState("hi")` (`App.jsx:32`). Hero `पत्ती दिखाओ, उपाय पाओ।`, sub with KCC `1800-180-1551`, CTAs `📷 निदान करें / 🎙️ बोलकर पूछें`, steps `फोटो लो/निदान पाओ/उपाय+SMS`. All sections bilingual (`DiagnosisCard/ChatBox/WeatherMandi/MapView/SmsLog` `hi ? … : …`). Crop chips Hindi (`सोयाबीन…धान`), ticker Hindi crop names, SMS fallback Hindi (`पत्ती जांच: …`), footer KCC `tel:18001801551` + `⚠️ AI सलाह है — …` disclaimer. EN toggle verified strings.

### 5. Accessibility — PASS (5/5 gates)
- `focus-visible`: `index.css:81` `:where(a,button,input,select,textarea,[tabindex]):focus-visible { outline:3px solid #1d6fd8; offset 2px }` — found in built CSS.
- `skip link`: `App.jsx:37` `skip-link → #nidan` (`मुख्य निदान पर जाएं`), CSS `:199-213` offscreen until `:focus`. PASS.
- `live regions`: `ChatBox:82 aria-live=polite` conversation + `:158 assertive` listening; `DiagnosisCard:188 polite` scanning + `:205 polite` result + `:178 role=alert` error; `WeatherMandi:80 role=alert` mandi error; `SmsLog:42 polite` thread. PASS.
- `reduced-motion`: `index.css:219` `@media (prefers-reduced-motion: reduce)` kills animations/transitions, `ticker-track { animation:none; flex-wrap:wrap }`, `.scan-box::after { display:none }`. Global `*` override covers mic pulse. Found in built CSS. PASS.
- `44px targets`: `.btn/.btn-sec/.btn-haldi min-height 44px` (`index.css:47,53,59`), nav links `min-h-[44px]` (`App.jsx:44,56,59,62,65`), mandi `select min-h-[44px]` (`WeatherMandi:64`), dropzone `min-h-[132px]`, chat input `min-h-[56px] text-[16px]` (no iOS zoom), mic `56×56` (`index.css:160-162`), send `w-14 h-14 min-h-[56px]`. `touch-action: manipulation` (`index.css:216`). See Bugs (low) for 3×40px + chips 36px deviations — still pass WCAG 2.2 AA 24px minimum.

### 6. Demo 90-sec Flow — PASS (all 9 beats, static + docs/demo-script.md)
| Beat | Evidence | Result |
|---|---|---|
| Header lang toggle big | `App.jsx:69-84` `role=group aria-label भाषा चुनें`, `हिंदी/EN` `aria-pressed`, `!min-h-[40px]` (see bug L2) | PASS |
| Hero dropzone | `DiagnosisCard:126-167` `role=button tabIndex 0` + Enter/Space, dragOver/Drop, `JPG/PNG`, `capture=environment`, `sr-only` file input, empty hint `👆 पहले फोटो जोड़ें` | PASS |
| Vein-meter | `DiagnosisCard:215-223` `.vein-meter` gradient + `.vein-needle left conf%`, `role=img aria-label विश्वास %`, `<0.7 ⚠️ संदिग्ध` badge | PASS |
| Chat mic 56px | `ChatBox:138-147` `.mic-big listening` + `pulse-ring`, `hi-IN/en-IN` SR, `onerror/onend` reset, inline `voiceHint` (no `alert`), quick chips, `➤` 56px send | PASS |
| Mandi ticker | `WeatherMandi:97-109` `.ticker-wrap/.ticker-track 28s linear infinite`, pause on `hover/focus-within`, duplicated `[0,1]` with `aria-hidden` on copy, `HI_CROP` names | PASS |
| Map directions | `MapView:66-74` `🧭 रास्ता/Go` → `google.com/maps/dir/?api=1&destination=…&origin=lat,lon`, dynamic `mapQuery` from geo (M3 fix), list-mode fallback when no `VITE_MAPS_API_KEY` | PASS |
| SMS thread | `SmsLog:42-74` phone-thread (`KISAAN-MITRA/VM-KISAAN`), `aria-live polite`, count badge, `↻ ताज़ा करें`, 10s poll + `visibilitychange` pause (M7 fix) | PASS |
| Empty/error guidance | No-photo `पहले पत्ती…`, non-image `सिर्फ फोटो चुनें`, >12MB, 413, `नेट नहीं — SMS भेज देंगे`, mandi `भाव उपलब्ध नहीं`, chat `नेटवर्क दिक्कत — SMS`, map `Map key नहीं — सूची मोड`, SMS `अभी कोई SMS नहीं — …` | PASS |
| Mobile 360 + desktop | `max-w-6xl px-3 sm:px-5`, hero `text-4xl sm:5xl lg:6xl`, `grid lg:grid-cols-12` (nidan 7 / mitra+sms 5 / mausam 7 / map 5), `WeatherMandi md:grid-cols-2`, nav `hidden md:flex`, footer `sm:grid-cols-3`, `scroll-mt-20` anchors | PASS (static; no device lab) |

### 7. Theme / Fonts — PASS
- Khet Monsoon tokens `:root --khet-950…--haldi-400…--paper` + Tailwind `khet 50-950/haldi/mitti/monsoon` + `card/btn/btn-sec/btn-haldi/chip/eyebrow/skeleton/ticker/scan-box/vein-meter/mic-big/sms-bubble` all in built CSS. Fonts `Baloo 2/Mukta/IBM Plex Mono` via Google Fonts link + `font-display/body/mono`. Scanline `::after` gradient + glow, ticker mask fade edges.

## Bugs Found (severity: critical/high/medium/low, file:line)
- **low** — `frontend/src/index.css:65` `.chip { min-height: 36px }` below strict 44px HIG (crop chips, quick asks). Passes WCAG 24px; recommend 40-44px on next pass. Not blocking demo.
- **low** — `frontend/src/App.jsx:71,78` lang toggle `!min-h-[40px]` overrides 44px base; `frontend/src/components/MapView.jsx:67`, `frontend/src/components/SmsLog.jsx:33` same 40px. Header-compact tradeoff; passes WCAG, fails strict 44px AppleRec. Enlarge to 44px if header height allows.
- **low** — `frontend/index.html:2` static `lang="hi"` never switches on EN toggle (`App.jsx:32`). Screen readers mis-announce EN mode. Fix: `useEffect(() => document.documentElement.lang = lang, [lang])` + `lang` attrs on EN strings. Test-only finding, no app edit made.
- **low** — `frontend/src/components/DiagnosisCard.jsx:51,63-64` `URL.createObjectURL` for preview + `compressImage` never `URL.revokeObjectURL` — memory growth on repeated diagnoses (soak). Revoke on `pick`/unmount.
- **low** — `frontend/src/components/DiagnosisCard.jsx:68` hardcoded `farmId: "farm-1"` demo simplification; prod needs real farm selector. No demo impact.
- **low** — `frontend/src/components/MapView.jsx:18-21` geolocation failure silently keeps Indore default; out-of-Indore farmer sees wrong mandis with only `lat,lon` mono footer as clue. Add `📍 Indore (default)` label.
- **info** — `frontend/src/components/DiagnosisCard.jsx:162` `capture="environment"` forces rear camera on mobile; blocks gallery-pick on some Android/desktop demo. Acceptable for field, keep fallback in mind for recording.
- No critical/high/medium. No `dangerouslySetInnerHTML` (chat uses React text). No hardcoded secrets (`VITE_MAPS_API_KEY` env only).

## Regression Risks
- Ticker `translateX(-50%)` assumes exactly 2 copies (`[0,1]`); adding a third breaks loop. Guard with comment/test.
- Scanline `scan-box` only while `loading`; if `compressImage` hangs (4G), shimmer + `aria-hidden` skeletons have no timeout — add 15s timeout + retry.
- SMS 10s poll + `api("/api/sms/log")` reverses `slice(-20)`; high-frequency diagnoses could push demo SMS off list — pin latest diagnosis SMS.
- `compressImage` 1024px/0.7 keeps `p95<2.5s` on mock; real Flash latency + 8mb backend limit untested on slow 4G — keep 12MB client guard + 413 message.
- Reduced-motion `flex-wrap` ticker changes layout height; snapshot tests must assert both motion modes.
- `Idempotency-Key newId()` crypto fallback works on `http://192.168.x.x` (M4) — do not revert to bare `randomUUID`.
- Backend `single-service` serves `dist/`; frontend `dist` hash `index-BqtgCYW4.js` must be rebuilt before Cloud Run deploy or stale UI ships.

## Quality Gates
- Build PASS 1.45s ✅ | No new deps ✅ | /api unchanged ✅ | Hindi-first ✅ | a11y 5/5 ✅ | Demo 9/9 ✅ | Coverage: meaningful paths (happy + empty + 404 + network) ✅ | No critical/high open ✅
