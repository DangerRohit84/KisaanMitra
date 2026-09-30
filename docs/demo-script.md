# KisaanMitra Demo Script (3–5 min video outline)

**0:00–0:20 Problem:** Small/marginal MP soybean farmer, Hindi-only, patchy net. Leaf yellowing → wrong spray → loss. Existing apps English/text-only.
**0:20–0:50 Solution:** KisaanMitra — बोलें या फोटो भेजें, सलाह + मंडी + मौसम एक जगह। Stack strip: Gemini 1.5 Flash · Genkit `agriAdvise` · Firebase · Cloud Run · Maps · SMS fallback.
**0:50–1:50 LIVE — Photo:** Upload leaf photo (or sample) → card: disease + 82% + remedy + dosage + ⚠️ disclaimer (officer + KCC). Point out: client compress, Idempotency-Key, Flash p95<2.5s.
**1:50–2:30 LIVE — Voice chat:** Toggle हिंदी, tap 🎙️ "सोयाबीन में पीले धब्बे हैं" → reply + follow-up. Show EN toggle.
**2:30–3:10 LIVE — Data fusion:** Weather card (29°C mock + spray advisory, cached 1h) → Mandi dropdown (soybean ₹4892/q Indore, CSV) → Map nearby (Choithram Mandi 1.8km) → SMS log auto-entry in Hindi.
**3:10–3:40 Pilot:** 1 FPO Sanwer × 50 farmers, KVK Indore, success metrics, cost (scale-to-zero).
**3:40–4:00 Close:** GitHub + live link + "KCC 1800-180-1551 के साथ, किसान के भरोसे के साथ।"

**Deck (10–12):** 1 Title+track 2 Problem 3 User persona 4 Solution screenshot 5 Live demo QR 6 AI (Flash+RAG+flow diagram) 7 Data fusion (weather/mandi/maps) 8 Offline/SMS 9 Pilot 10 Scale/cost 11 Risks+disclaimer 12 Team/ask.
**If live fails:** keep 30s pre-recorded screen capture as backup; mock mode always works offline.
