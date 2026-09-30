# 🌾 KisaanMitra — Kisan Alert / Agricultural Intelligence
**Build with AI: Code for Communities 2nd Edition · Track 4 · Hackathon MVP (30 Sept 2026)**

Voice-first Hindi advisories for small/marginal farmers: leaf photo diagnosis (Gemini vision) + chat/voice + weather + mandi + maps + SMS fallback.

**Stack (as required):** Vite+React+Tailwind (Firebase Hosting) + Node20+Express+Genkit-JS single Cloud Run service · Gemini 1.5 Flash via AI Studio · Firebase Auth/Firestore · Maps JS + Places · 1 Genkit flow `agriAdvise`.

## 1) Quick run (no keys — mock mode)

```powershell
# backend
cd backend; npm install; npm run dev        # :8080, mock=true
# frontend (new terminal)
cd frontend; npm install; npm run dev       # :5173 -> proxies /api to :8080
# open http://localhost:5173
```

> **Port conflict (M1):** if `:8080` is taken (e.g. EnterpriseDB `httpd` on QA box — `netstat -ano | findstr 8080`),
> run backend on another port and point Vite at it:
> ```powershell
> # terminal 1 — backend on 8081
> cd backend; $env:PORT=8081; npm run dev
> # terminal 2 — frontend proxies /api to 8081
> cd frontend; $env:VITE_API_TARGET="http://localhost:8081"; npm run dev
> ```
> Cloud Run is unaffected (provides `$PORT` automatically).

Mock covers: diagnosis (soybean YMV 82%), chat Hindi, weather (Indore mock + advisory), mandi CSV (10 crops), nearby 3 places, SMS log.

## 2) With real keys (optional, same code)

```powershell
cp ../.env.example ./backend/.env
# fill GEMINI_API_KEY (AI Studio), OPENWEATHER_API_KEY, MAPS_API_KEY, VITE_* Firebase
# frontend: cp ../.env.example ./.env  (VITE_ vars)
MOCK_MODE=false npm --prefix backend run dev
```

Notes:
- Images compress client-side (≤1024px jpeg 0.7) before POST — keeps Flash p95 <2.5s.
- `POST /api/diagnose` needs `Idempotency-Key: <uuid>` header (safe retry on flaky net).
- Weather cached 1h server-side + singleflight (no stampede).
- RAG: `backend/data/agronomy_brief.md` injected into every Gemini prompt (stand-in for 5-page SAU PDF).
- Firestore rules: `firestore.rules` allow if auth!=null (Day1). Admin save best-effort; app runs without creds.

## 3) APIs

| Method | Path | Notes |
|---|---|---|
| POST | /api/diagnose | {imageBase64, lang, farmId, crop} + Idempotency-Key → {disease, confidence, remedy, dosage, urgency, disclaimer} |
| POST | /api/chat | {text, lang, history} → {reply, disclaimer} |
| GET | /api/mandi?crop=soybean | CSV 10 crops → {price, market, updatedAt} |
| GET | /api/weather?lat&lon | OpenWeather or mock, cached 1h |
| GET | /api/mandis/nearby?lat&lon | mock 3 results + Places hint |
| POST/GET | /api/sms/log | Hindi SMS simulation |
| GET | /api/health, /api/seed | status + seed |

Collections: `users{lang}` · `farms{uid,geo,crop}` · `diagnoses{farmId,imageUrl,disease,confidence,remedy,createdAt}` · `mandiCache{crop,price,updatedAt}` · `smsLog{...}`. Seed: `backend/data/seed.json` via `npm run seed` (pushes to Firestore only if creds).

## 4) Deploy — FREE (Vercel + Render, no card)

**Backend → Render (free web service):**
1. Push repo to GitHub.
2. Render Dashboard → New → Blueprint → select repo (`render.yaml` at root).
3. Set env in Dashboard: `GEMINI_API_KEY=<key>`, `CORS_ORIGIN=https://<your-vercel>.vercel.app` (keep `MOCK_MODE=false`).
4. Note URL: `https://kisaanmitra-api.onrender.com` → put it in `frontend/vercel.json` rewrite destination.

**Frontend → Vercel (free):**
1. Vercel → New Project → select repo → Root Directory = `frontend`.
2. Build: `npm run build`, Output: `dist` (already in `frontend/vercel.json`).
3. Deploy — `/api/:path*` proxies to Render (no CORS change needed).

> **Warmup note:** Render free spins down after ~15 min idle. First `/api/*` call after idle takes ~30–60s (cold start), then normal. Keep `/api/health` pinged during demos.

<details>
<summary>Alt: single Cloud Run service</summary>

```powershell
# serves API + frontend/dist
cd frontend; npm run build
gcloud run deploy kisaanmitra-api --source . --region asia-south1 --allow-unauthenticated
# + Firebase Hosting (optional split): firebase deploy --only hosting,firestore:rules
```

`backend/Dockerfile` builds this layout. `firebase.json` rewrites `/api/**` → Cloud Run service.
</details>

## 5) What's mocked vs real

- **Mock (default):** Gemini (deterministic YMV/chat), OpenWeather, Places nearby, Firestore (in-memory + CSV), Auth (anonymous/no-op), SMS (logged, not sent).
- **Real when keys set:** Gemini 1.5 Flash vision+chat, OpenWeather current, Maps embed + Places, Firestore via Admin SDK, Firebase Auth.
- RAG PDF → `agronomy_brief.md` excerpt (replace with vetted ICAR/SAU sheets before pilot).

## 6) Pilot slide (for deck)
**1 FPO · 50 farmers · Sanwer, Indore (soybean belt).** Week 1: onboarding + Hindi voice demo; Week 2-4: photo diagnoses + SMS fallback; Success: ≥70% useful-rating, ≥30 repeat users, 100+ diagnoses. Partner: FPO + KVK Indore. Cost: AI Studio pay-as-you-go + Cloud Run scale-to-zero.

## 7) Demo (3–5 min) + deck
See `docs/demo-script.md`. Flow: Hindi voice → leaf photo → remedy + disclaimer → mandi/weather → map → SMS log → pilot slide. Deck 10–12 slides: problem, user, solution, live demo, AI (Flash+RAG+Genkit flow), data fusion, offline/SMS, pilot, scale, cost, team/ask.

## 8) Next steps
1. `npm install` both + screenshot mock run for deck.
2. Record 3–5 min video (Hindi voice first) + push to public GitHub.
3. Add keys → re-record 30s live-Gemini clip if time.
4. Replace brief with SAU PDFs + harden Firestore rules per-user before pilot.
