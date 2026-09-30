// KisaanMitra API - single Cloud Run service (Express + Genkit-JS prompt flow)
// Stack: Node20, Gemini 1.5 Flash via AI Studio, Firestore (optional), Open-Meteo free + OpenWeather optional (cached), Agmarknet CSV+live, Overpass free + Places optional.
// Policy: FREE-LIVE-FIRST (Open-Meteo + Overpass need no key) then REAL-FIRST when keys present (MOCK_MODE=false default with keys), mock fallback NEVER silent —
// every response carries an honest `source` flag (open-meteo-live/overpass-live/live/mock/owm-error/etc) + logging with [service] prefix.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDiagnosePrompt, buildChatPrompt, disclaimers, loadBrief } from "./genkit/agriAdvise.js";

console.log("[kisaanmitra] booting…");

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env") });
dotenv.config(); // also root .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// CORS: hackathon default * ; prod restrict via CORS_ORIGIN="https://<hosting-domain>,https://<run-domain>"
const CORS_ORIGIN = process.env.CORS_ORIGIN;
app.use(CORS_ORIGIN ? cors({ origin: CORS_ORIGIN.split(",").map((s) => s.trim()) }) : cors());
app.use(express.json({ limit: "8mb" })); // base64 leaf photos (client compresses first; diagnose enforces ~2MB post-compress + 413, see below)

const PORT = process.env.PORT || 8080;
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
// Real-first: live Gemini whenever a key exists unless operator forces MOCK_MODE=true.
const MOCK = !GEMINI_KEY || process.env.MOCK_MODE === "true";
let genkitFlow = null;
// Lazy Genkit init AFTER listen (never blocks boot; opt-in via ENABLE_GENKIT=true).
// Day1 mock path needs no Genkit at all — flow definition lives in genkit/agriAdvise.js.

// ---- Per-service live-key detection (independent of global Gemini MOCK) ----
const OWM_KEY = process.env.OPENWEATHER_API_KEY || "";
const MAPS_KEY = process.env.MAPS_API_KEY || "";
const AGMARKNET_KEY = process.env.AGMARKNET_KEY || process.env.AGMARKNET_API_KEY || "";
const AGMARKNET_API_URL = process.env.AGMARKNET_API_URL || ""; // override, else data.gov.in default attempt
const SMS_PROVIDER = (process.env.SMS_PROVIDER || "").toLowerCase(); // msg91 | twilio | "" (=mock)
const SMS_KEY = process.env.SMS_KEY || process.env.MSG91_AUTHKEY || process.env.TWILIO_AUTH_TOKEN || "";

// ---- In-memory stores (Firestore when creds exist, else memory + persist:false) ----
const idemCache = new Map(); // Idempotency-Key -> response
const diagnosesMem = [];
const smsLogMem = [];
let mandiRows = [];
let mandiCsvDate = "";
try {
  const csv = fs.readFileSync(path.join(__dirname, "data", "mandi_prices.csv"), "utf8").trim().split("\n");
  const [head, ...lines] = csv;
  const cols = head.split(",");
  mandiRows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
  mandiCsvDate = mandiRows[0]?.updated || "";
} catch { mandiRows = []; }

function mandiStaleInfo() {
  // CSV is a dated snapshot — surface staleness honestly so UI can warn.
  if (!mandiCsvDate) return { stale: true, staleDays: null };
  const ms = Date.now() - new Date(mandiCsvDate + "T00:00:00Z").getTime();
  const staleDays = Math.max(0, Math.floor(ms / 86400000));
  return { stale: staleDays > 2, staleDays, csvDate: mandiCsvDate };
}

// ---- Firestore (best-effort; never blocks boot, never throws into requests) ----
let firestoreReady = false;
let firestoreDb = null;
const firestoreConfigured = !!(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS);
async function initFirestore() {
  if (!firestoreConfigured) {
    console.log("[firestore] no creds — in-memory store (persist:false)");
    return;
  }
  try {
    const admin = (await import("firebase-admin")).default;
    if (!admin.apps.length) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    firestoreDb = admin.firestore();
    firestoreReady = true;
    console.log("[firestore] Admin ready — diagnoses will persist (persist:true)");
  } catch (e) {
    firestoreReady = false;
    console.warn("[firestore] init failed, falling back to memory:", e.message);
  }
}
initFirestore();

// Best-effort Firestore save — returns true when persisted, false when memory-only.
async function saveDiag(doc) {
  if (!firestoreConfigured || !firestoreReady || !firestoreDb) return false;
  try {
    await firestoreDb.collection("diagnoses").add({ ...doc, createdAt: new Date().toISOString() });
    return true;
  } catch (e) { console.warn("[firestore] save skip:", e.message); return false; }
}

// Singleflight + TTL cache for weather (1h). Prevents stampede on demo refresh.
// Priority: Open-Meteo free (no key) FIRST -> OWM optional if OPENWEATHER_API_KEY set -> labelled mock.
const weatherCache = new Map(); // key -> {data, exp}
const weatherInflight = new Map();
const WEATHER_TTL_MS = 60 * 60 * 1000;

function wmoToHindi(code) {
  const c = Number(code);
  if (c === 0) return "साफ आसमान";
  if (c === 1) return "मुख्यतः साफ";
  if (c === 2) return "आंशिक बादल";
  if (c === 3) return "बादल छाए";
  if (c === 45 || c === 48) return "कोहरा/धुंध";
  if (c === 51 || c === 53 || c === 55 || c === 56 || c === 57) return "बूंदाबांदी";
  if (c === 61 || c === 63 || c === 65 || c === 66 || c === 67) return "बारिश";
  if (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) return "बर्फ/बर्फीली बौछारें";
  if (c === 80 || c === 81 || c === 82) return "बौछारें";
  if (c === 95) return "गरज के साथ बारिश";
  if (c === 96 || c === 99) return "ओले के साथ गरज";
  return "मौसम उपलब्ध";
}

async function fetchOpenMeteo(lat, lon) {
  // Free, no key. https://open-meteo.com (CC-BY 4.0, attribution in UI/hint).
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FKolkata`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "KisaanMitra/1.0" } });
    if (!r.ok) throw new Error("open-meteo-" + r.status);
    const j = await r.json();
    const cur = j?.current_weather;
    if (!cur || typeof cur.temperature !== "number") throw new Error("open-meteo-empty");
    const daily = j?.daily || {};
    const i0 = 0;
    const tMax = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[i0] : null;
    const tMin = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[i0] : null;
    const precip = Array.isArray(daily.precipitation_sum) ? daily.precipitation_sum[i0] : null;
    const descHi = wmoToHindi(cur.weathercode);
    const advisory = (precip ?? 0) > 5
      ? "अगले 24 घंटे में भारी बारिश संभव — छिड़काव/कटाई टालें, जल-निकासी रखें।"
      : (precip ?? 0) > 0.5
        ? "अगले 24 घंटे में हल्की बारिश संभव — छिड़काव टालें।"
        : "मौसम साफ — छिड़काव/खाद के लिए उपयुक्त।";
    return {
      tempC: cur.temperature, humidity: null,
      desc: `${descHi} (live)`, wind: cur.windspeed ?? null,
      place: `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`,
      source: "open-meteo-live", cached: false,
      advisory,
      daily: { tempMax: tMax, tempMin: tMin, precipSumMm: precip, date: daily.time?.[i0] || null },
      weathercode: cur.weathercode ?? null,
      observedAt: cur.time || null,
      attribution: "Open-Meteo (CC-BY 4.0)",
    };
  } finally { clearTimeout(t); }
}

async function fetchOWM(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric&lang=hi`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("owm-" + r.status);
  const j = await r.json();
  return {
    tempC: j.main?.temp, humidity: j.main?.humidity,
    desc: j.weather?.[0]?.description, wind: j.wind?.speed,
    place: j.name, source: "openweather-live", cached: false,
  };
}

async function fetchWeather(lat, lon) {
  const key = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
  const now = Date.now();
  const hit = weatherCache.get(key);
  if (hit && hit.exp > now) return { ...hit.data, cached: true };
  if (weatherInflight.has(key)) return weatherInflight.get(key);
  const p = (async () => {
    const hasKey = !!OWM_KEY;
    // 1) Open-Meteo free first (no key, source open-meteo-live).
    try {
      const data = await fetchOpenMeteo(lat, lon);
      console.log(`[weather] open-meteo-live ${key} ${data.tempC}C wmo=${data.weathercode}`);
      weatherCache.set(key, { data, exp: now + WEATHER_TTL_MS });
      return data;
    } catch (eFree) {
      const freeMsg = eFree?.message || "open-meteo-failed";
      console.warn(`[weather] open-meteo failed (${freeMsg}) — trying ${hasKey ? "OWM" : "mock fallback"}`);
      // 2) OWM optional when key present (kept for humidity/place names).
      if (hasKey) {
        try {
          const data = await fetchOWM(lat, lon);
          console.log(`[weather] live ${key} ${data.tempC}C ${data.place || ""} (owm fallback after open-meteo fail)`);
          weatherCache.set(key, { data, exp: now + WEATHER_TTL_MS });
          return data;
        } catch (eOwm) {
          const errMsg = `${freeMsg}; ${eOwm?.message || "owm-failed"}`;
          console.warn(`[weather] owm-error (${errMsg}) — serving labelled fallback`);
          const data = {
            tempC: 29, humidity: 72, desc: "हल्के बादल (mock)", wind: 3.1,
            place: "Indore (mock)", source: "owm-error", cached: false,
            advisory: "अगले 24 घंटे में हल्की बारिश संभव — छिड़काव टालें।",
            error: errMsg, note: "Open-Meteo + OpenWeather failed — showing fallback, check net/key/quota.",
          };
          weatherCache.set(key, { data, exp: now + WEATHER_TTL_MS });
          return data;
        }
      }
      // 3) Mock fallback (honest source mock, never silent).
      console.log("[weather] serving mock fallback (open-meteo unreachable, no OWM key)");
      const data = {
        tempC: 29, humidity: 72, desc: "हल्के बादल (mock)", wind: 3.1,
        place: "Indore (mock)", source: "mock", cached: false,
        advisory: "अगले 24 घंटे में हल्की बारिश संभव — छिड़काव टालें।",
        error: freeMsg,
      };
      weatherCache.set(key, { data, exp: now + WEATHER_TTL_MS });
      return data;
    } finally { weatherInflight.delete(key); }
  })();
  weatherInflight.set(key, p);
  return p;
}

// ---- Gemini helpers: safe JSON parse + raw fallback + logging ----
function stripCodeFence(s) {
  // Removes ```json ... ``` wrappers the model sometimes adds.
  return String(s || "").replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}
function parseGeminiJson(text) {
  // Safe parse: fence-strip -> largest {...} -> full text. Throws with rawText on failure.
  const clean = stripCodeFence(text);
  const candidates = [];
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) candidates.push(m[0]);
  candidates.push(clean);
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (o && typeof o === "object") return o;
    } catch { /* try next */ }
  }
  const err = new Error("gemini-json-parse-failed");
  err.rawText = String(text || "").slice(0, 2000);
  throw err;
}

async function geminiText(prompt) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL }); // Flash, NOT Pro (p95<2.5s)
  const t0 = Date.now();
  try {
    const res = await model.generateContent(prompt);
    const text = res.response.text();
    console.log(`[gemini] text ok ${Date.now() - t0}ms model=${GEMINI_MODEL}`);
    return { text, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[gemini] text failed: ${e.message}`);
    throw e;
  }
}

async function geminiVision(prompt, imageBase64) {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const t0 = Date.now();
  try {
    const clean = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const res = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: clean } },
    ]);
    const text = res.response.text();
    console.log(`[gemini] vision ok ${Date.now() - t0}ms model=${GEMINI_MODEL}`);
    return { text, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[gemini] vision failed: ${e.message}`);
    throw e;
  }
}

// ---- Mandi: Agmarknet live (data.gov.in) when AGMARKNET_KEY, else CSV + stale warning ----
async function fetchMandiLive(crop) {
  // data.gov.in Agmarknet resource; URL overridable via AGMARKNET_API_URL for key rotation/resource changes.
  const base = AGMARKNET_API_URL || "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
  const cap = crop.charAt(0).toUpperCase() + crop.slice(1);
  const url = `${base}?api-key=${encodeURIComponent(AGMARKNET_KEY)}&format=json&limit=5&filters%5Bcommodity%5D=${encodeURIComponent(cap)}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("agmarknet-" + r.status);
    const j = await r.json();
    const rec = j?.records?.[0];
    if (!rec) throw new Error("agmarknet-empty");
    const price = Number(rec.modal_price ?? rec.modal_price_quintal ?? rec.price);
    if (!Number.isFinite(price)) throw new Error("agmarknet-noprice");
    return {
      crop, price, unit: "quintal",
      market: rec.market || rec.district || "Agmarknet",
      updatedAt: rec.arrival_date || new Date().toISOString().slice(0, 10),
      source: "agmarknet-live",
    };
  } finally { clearTimeout(t); }
}

async function getMandi(crop) {
  const row = mandiRows.find((r) => r.crop === crop);
  const stale = mandiStaleInfo();
  const csvFallback = row ? {
    crop: row.crop, price: Number(row.modal_price_quintal), unit: row.unit,
    market: row.market, updatedAt: row.updated,
    source: "agmarknet-static-csv",
    ...stale,
    ...(stale.stale ? { warning: `CSV snapshot ${stale.csvDate} is ${stale.staleDays}d old — set AGMARKNET_KEY for live prices.` } : {}),
  } : null;
  if (!AGMARKNET_KEY) {
    if (csvFallback) console.log(`[mandi] csv ${crop} (no AGMARKNET_KEY${stale.stale ? `, stale ${stale.staleDays}d` : ""})`);
    return { data: csvFallback, liveAttempted: false };
  }
  try {
    const live = await fetchMandiLive(crop);
    console.log(`[mandi] live ${crop} ₹${live.price} ${live.market}`);
    return { data: { ...live, ...stale, stale: false, staleDays: 0 }, liveAttempted: true };
  } catch (e) {
    console.warn(`[mandi] live failed (${e.message}) — CSV fallback for ${crop}`);
    if (csvFallback) return { data: { ...csvFallback, source: "agmarknet-csv-fallback", liveError: e.message }, liveAttempted: true };
    throw e;
  }
}

// ---- Places: Overpass free (no key) FIRST, Google Places live when MAPS_API_KEY, else honest static fallback ----
function haversineKm(a, b, c, d) {
  const R = 6371, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}
const STATIC_PLACES = [
  { name: "Choithram Mandi, Indore", type: "mandi", lat: 22.7253, lon: 75.8655, distKm: 1.8 },
  { name: "Sanwer Krishi Upaj Mandi", type: "mandi", lat: 22.9727, lon: 75.8317, distKm: 28 },
  { name: "IFFCO Bazar - Khargone Rd", type: "agri_store", lat: 22.708, lon: 75.84, distKm: 2.1 },
];
async function fetchOverpassLive(lat, lon) {
  // Free, no key. OSM Overpass: shop=agrarian + amenity=marketplace within 10km.
  // Usage policy: single POST, User-Agent KisaanMitra/1.0, 12s timeout, max 10 results.
  const q = `[out:json][timeout:15];(node["shop"="agrarian"](around:10000,${lat},${lon});node["amenity"="marketplace"](around:10000,${lat},${lon});way["shop"="agrarian"](around:10000,${lat},${lon});way["amenity"="marketplace"](around:10000,${lat},${lon}););out center 10;`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "KisaanMitra/1.0" },
      body: "data=" + encodeURIComponent(q),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error("overpass-" + r.status);
    const j = await r.json();
    const els = Array.isArray(j?.elements) ? j.elements : [];
    return els.slice(0, 10).map((el) => {
      const tags = el.tags || {};
      const plat = el.lat ?? el.center?.lat ?? null;
      const plon = el.lon ?? el.center?.lon ?? null;
      const name = tags.name || tags["name:hi"] || tags.shop || tags.amenity || "Unnamed mandi/agri store";
      const isStore = tags.shop === "agrarian" || /store|shop|bazaar|iffco|khad|beej|agri/i.test(`${name} ${tags.shop || ""}`);
      return {
        name,
        type: isStore && tags.amenity !== "marketplace" ? "agri_store" : "mandi",
        lat: plat, lon: plon,
        distKm: (plat != null && plon != null) ? haversineKm(Number(lat), Number(lon), plat, plon) : null,
        tags: { shop: tags.shop || null, amenity: tags.amenity || null },
      };
    });
  } finally { clearTimeout(t); }
}
async function fetchPlacesLive(lat, lon) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=30000&keyword=${encodeURIComponent("mandi krishi upaj agri input store")}&key=${encodeURIComponent(MAPS_KEY)}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error("places-" + r.status);
    const j = await r.json();
    if (j.status !== "OK" && j.status !== "ZERO_RESULTS") throw new Error("places-" + (j.status || "failed"));
    return (j.results || []).slice(0, 8).map((p) => ({
      name: p.name,
      type: /store|shop|bazaar|iffco|khad|beej/i.test(`${p.name} ${p.types}`) ? "agri_store" : "mandi",
      lat: p.geometry?.location?.lat, lon: p.geometry?.location?.lng,
      distKm: p.geometry?.location ? haversineKm(lat, lon, p.geometry.location.lat, p.geometry.location.lng) : null,
      rating: p.rating ?? null,
    }));
  } finally { clearTimeout(t); }
}

// ---- SMS: MSG91 / Twilio live when configured, else in-memory log + queued ----
function smsConfig() {
  if (SMS_PROVIDER === "msg91" && SMS_KEY) {
    return { live: true, provider: "msg91", sender: process.env.SMS_SENDER || process.env.MSG91_SENDER || "KISAAN" };
  }
  if (SMS_PROVIDER === "twilio" && SMS_KEY && (process.env.TWILIO_ACCOUNT_SID || process.env.SMS_SID)) {
    return {
      live: true, provider: "twilio",
      sid: process.env.TWILIO_ACCOUNT_SID || process.env.SMS_SID,
      from: process.env.TWILIO_FROM || process.env.SMS_FROM || "",
    };
  }
  return { live: false, provider: "mock-log" };
}
async function sendSmsLive(phone, message) {
  const cfg = smsConfig();
  if (!cfg.live) return { sent: false, queued: true, provider: "mock-log", source: "mock-log" };
  if (cfg.provider === "msg91") {
    const url = `https://control.msg91.com/api/v5/flow/sms?authkey=${encodeURIComponent(SMS_KEY)}`;
    const body = {
      sender: cfg.sender, route: "4", country: "91",
      sms: [{ to: [String(phone).replace(/\D/g, "").slice(-10)], message }],
      ...(process.env.SMS_DLT_TEMPLATE_ID ? { DLT_TE_ID: process.env.SMS_DLT_TEMPLATE_ID } : {}),
    };
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
      const txt = await r.text();
      if (!r.ok) throw new Error("msg91-" + r.status + " " + txt.slice(0, 120));
      console.log(`[sms] msg91 sent -> ${phone}`);
      return { sent: true, queued: false, provider: "msg91", source: "msg91-live", sid: txt.slice(0, 64) };
    } finally { clearTimeout(t); }
  }
  // Twilio
  const sid = cfg.sid;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const creds = Buffer.from(`${sid}:${SMS_KEY}`).toString("base64");
  const form = new URLSearchParams({ To: phone, From: cfg.from, Body: message });
  const ctl2 = new AbortController();
  const t2 = setTimeout(() => ctl2.abort(), 8000);
  try {
    const r = await fetch(url, {
      method: "POST", headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(), signal: ctl2.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("twilio-" + r.status + " " + (j.message || "").slice(0, 120));
    console.log(`[sms] twilio sent -> ${phone} sid=${j.sid || ""}`);
    return { sent: true, queued: false, provider: "twilio", source: "twilio-live", sid: j.sid || "" };
  } finally { clearTimeout(t2); }
}

// ---- APIs ----
app.get("/api/health", (_req, res) => res.json({
  ok: true, mock: MOCK, model: GEMINI_MODEL, time: new Date().toISOString(),
  // Genkit status — prompt-builders always used; flow opt-in via ENABLE_GENKIT=true.
  genkit: {
    promptBuilders: true, flowActive: !!genkitFlow,
    mode: process.env.ENABLE_GENKIT === "true" ? (genkitFlow ? "flow" : "flow-pending") : "prompt-builders+mock (Day1)",
    briefChars: (() => { try { return loadBrief().length; } catch { return 0; } })(),
  },
  services: {
    gemini: MOCK ? "mock" : "live",
    weather: OWM_KEY ? "open-meteo-live-free + owm-key-optional" : "open-meteo-live-free (no key)",
    mandi: AGMARKNET_KEY ? "live-try" : "static-csv",
    places: MAPS_KEY ? "overpass-live-free + places-key-optional" : "overpass-live-free (no key)",
    sms: smsConfig().live ? smsConfig().provider + "-live" : "mock-log",
    firestore: firestoreConfigured ? (firestoreReady ? "live" : "init-pending") : "memory",
  },
}));

app.get("/api/seed", (_req, res) => {
  try {
    const j = fs.readFileSync(path.join(__dirname, "data", "seed.json"), "utf8");
    res.type("json").send(j);
  } catch { res.json({ users: [], farms: [] }); }
});

// POST /api/diagnose — Idempotency-Key required (safe retry on flaky rural net)
app.post("/api/diagnose", async (req, res) => {
  const t0 = Date.now();
  const idemKey = req.header("Idempotency-Key");
  if (!idemKey) return res.status(400).json({ error: "Idempotency-Key header required" });
  if (idemCache.has(idemKey)) return res.json({ ...idemCache.get(idemKey), deduped: true });

  const { imageBase64 = "", lang = "hi", farmId = "farm-1", crop = "soybean" } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 required (client compresses to <=1024px jpeg)" });
  // Image-size guard — ~2MB binary post-compress (≈2.8M base64 chars incl. data-URL prefix). 8mb json limit stays as outer cap.
  if (imageBase64.length > 2_800_000) return res.status(413).json({ error: "image too large (compress to <=1024px jpeg 0.7, ~2MB max)" });

  const prompt = buildDiagnosePrompt({ lang });
  let out;
  try {
    if (MOCK) {
      await new Promise((r) => setTimeout(r, 400)); // simulate Flash latency
      out = {
        disease: crop === "soybean" ? "Soybean Yellow Mosaic Virus (suspected)" : "Leaf spot (suspected)",
        confidence: 0.82,
        remedy: lang === "hi"
          ? "3 गंभीर पौधे उखाड़कर नष्ट करें; 6 पीले चिपचिपे ट्रैप लगाएं; सफेद मक्खी दिखे तो अधिकारी से पूछकर ही छिड़काव करें।"
          : "Rogue 3 worst plants; set 6 yellow sticky traps; spray only after officer confirms whitefly.",
        dosage: "Thiamethoxam 25% WG @100 g/ha — ONLY per label + officer (indicative).",
        urgency: "medium",
        latencyMs: Date.now() - t0,
        source: "mock",
      };
      console.log(`[gemini] mock diagnose crop=${crop} ${out.latencyMs}ms`);
    } else {
      const { text, latencyMs } = await geminiVision(`${prompt}\nCrop: ${crop}`, imageBase64);
      try {
        const parsed = parseGeminiJson(text);
        out = {
          disease: parsed.disease || "Uncertain",
          confidence: Number(parsed.confidence ?? 0.5),
          remedy: String(parsed.remedy || "").slice(0, 500),
          dosage: String(parsed.dosage || "Confirm with officer"),
          urgency: ["low", "medium", "high"].includes(parsed.urgency) ? parsed.urgency : "medium",
          latencyMs, source: "gemini-live",
        };
      } catch (parseErr) {
        // Raw fallback: never crash on model prose — return visible text + flag for UI badge.
        console.warn(`[gemini] parse fallback (vision): ${parseErr.message} — returning raw text`);
        out = {
          disease: "Uncertain (see raw)", confidence: 0.5,
          remedy: stripCodeFence(parseErr.rawText || text).slice(0, 400),
          dosage: "Confirm with officer", urgency: "medium",
          latencyMs, source: "gemini-live", rawFallback: true, rawText: stripCodeFence(text).slice(0, 800),
        };
      }
    }
    const persisted = await saveDiag({ ...out, farmId, crop, lang });
    const resp = {
      ...out, disclaimer: disclaimers(lang), farmId, createdAt: new Date().toISOString(),
      model: MOCK ? "mock" : GEMINI_MODEL,
      persist: persisted, store: persisted ? "firestore" : "memory",
    };
    diagnosesMem.push(resp);
    idemCache.set(idemKey, resp);
    res.json(resp);
  } catch (e) {
    console.error("[gemini] diagnose failed:", e.message);
    res.status(502).json({ error: "diagnosis failed", detail: e.message, source: MOCK ? "mock" : "gemini-live" });
  }
});

// POST /api/chat — text/voice transcript in, Hi/En out
app.post("/api/chat", async (req, res) => {
  const { text = "", lang = "hi", history = [] } = req.body || {};
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    let reply, source;
    if (MOCK) {
      // Echo full user text (600 to match live slice) so voice full-sentence
      // round-trips in mock; was slice(0,80) which truncated long sentences.
      reply = lang === "hi"
        ? `आपने कहा: "${text.slice(0, 600)}" — सोयाबीन में पीले धब्बे दिखें तो सफेद मक्खी जांचें, ट्रैप लगाएं। आपकी फसल कौन सी है?`
        : `Got it: "${text.slice(0, 600)}" — yellow patches on soybean suggest whitefly check + traps. Which crop is this?`;
      source = "mock";
    } else if (genkitFlow?.agriAdvise) {
      // Genkit flow path (ENABLE_GENKIT=true and registered) — falls back to direct Gemini below on error.
      try {
        const out = await genkitFlow.agriAdvise({ kind: "chat", lang, text, history: history.slice(-6) });
        reply = String(out?.text || "").slice(0, 600);
        source = "genkit-flow";
        console.log("[genkit] flow chat ok");
      } catch (e) {
        console.warn("[genkit] flow failed, direct Gemini fallback:", e.message);
        const prompt = buildChatPrompt({ lang, history });
        const r = await geminiText(`${prompt}\n\nFarmer: ${text}\nMitra:`);
        reply = stripCodeFence(r.text).slice(0, 600);
        source = "gemini-live";
      }
    } else {
      const prompt = buildChatPrompt({ lang, history });
      try {
        const r = await geminiText(`${prompt}\n\nFarmer: ${text}\nMitra:`);
        reply = stripCodeFence(r.text).slice(0, 600);
        source = "gemini-live";
      } catch (e) {
        // Live Gemini failed but keys exist — honest error source, never silent mock.
        console.warn("[gemini] chat live failed:", e.message);
        return res.status(502).json({ error: "chat failed", detail: e.message, source: "gemini-error" });
      }
    }
    res.json({ reply, disclaimer: disclaimers(lang), model: MOCK ? "mock" : GEMINI_MODEL, source });
  } catch (e) {
    console.warn("[gemini] chat failed:", e.message);
    res.status(502).json({ error: "chat failed", detail: e.message, source: MOCK ? "mock" : "gemini-error" });
  }
});

// GET /api/mandi?crop=soybean — Agmarknet live when AGMARKNET_KEY, else static CSV + stale warning.
// Unknown crop -> 404 with suggestions (never silently return soybean as if correct).
app.get("/api/mandi", async (req, res) => {
  const raw = req.query.crop;
  const crop = (raw || "soybean").toLowerCase();
  const row = mandiRows.find((r) => r.crop === crop);
  if (raw && !row) {
    const suggestions = mandiRows.map((r) => r.crop);
    return res.status(404).json({ error: "unknown crop", crop, suggestions, note: "Use one of suggestions; e.g. /api/mandi?crop=soybean" });
  }
  if (!row && !AGMARKNET_KEY) return res.status(404).json({ error: "no mandi data" });
  try {
    const { data } = await getMandi(crop);
    if (!data) return res.status(404).json({ error: "no mandi data" });
    res.json(data);
  } catch (e) {
    console.warn("[mandi] failed:", e.message);
    res.status(502).json({ error: "mandi failed", detail: e.message, source: "agmarknet-error" });
  }
});

// GET /api/weather?lat=22.71&lon=75.85 — Open-Meteo free first (no key), OWM optional, cached 1h, singleflight
app.get("/api/weather", async (req, res) => {
  const rawLat = req.query.lat, rawLon = req.query.lon;
  if (rawLat !== undefined || rawLon !== undefined) {
    const lat = Number(rawLat ?? process.env.DEFAULT_LAT ?? 22.7196);
    const lon = Number(rawLon ?? process.env.DEFAULT_LON ?? 75.8577);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
      return res.status(400).json({ error: "invalid lat/lon (lat -90..90, lon -180..180)" });
  }
  const lat = req.query.lat || process.env.DEFAULT_LAT || 22.7196;
  const lon = req.query.lon || process.env.DEFAULT_LON || 75.8577;
  res.json(await fetchWeather(lat, lon));
});

// GET /api/mandis/nearby?lat&lon — Overpass free first (no key, source overpass-live),
// Google Places live when MAPS_API_KEY (source places-live), else honest static fallback (mock-static).
app.get("/api/mandis/nearby", async (req, res) => {
  const lat = Number(req.query.lat || 22.7196), lon = Number(req.query.lon || 75.8577);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
    return res.status(400).json({ error: "invalid lat/lon (lat -90..90, lon -180..180)" });
  // 1) Overpass free (no key).
  try {
    const results = await fetchOverpassLive(lat, lon);
    console.log(`[places] overpass-live ${results.length} results @${lat},${lon}`);
    return res.json({
      origin: { lat, lon }, source: "overpass-live", results,
      mapsHint: "Live OpenStreetMap Overpass (free, no key): shop=agrarian + amenity=marketplace within 10km. © OpenStreetMap contributors.",
    });
  } catch (eOverpass) {
    const overpassErr = eOverpass?.message || "overpass-failed";
    console.warn(`[places] overpass failed (${overpassErr}) — ${MAPS_KEY ? "trying Google Places" : "static fallback"}`);
    // 2) Google Places optional when key present.
    if (MAPS_KEY) {
      try {
        const results = await fetchPlacesLive(lat, lon);
        console.log(`[places] live ${results.length} results @${lat},${lon} (after overpass fail)`);
        return res.json({
          origin: { lat, lon }, source: "places-live", results,
          mapsHint: "Live Google Places Nearby Search (Overpass unreachable).",
          overpassError: overpassErr,
        });
      } catch (e) {
        console.warn(`[places] places live failed (${e.message}) — static fallback`);
        return res.json({
          origin: { lat, lon }, source: "places-fallback", error: `overpass: ${overpassErr}; places: ${e.message}`,
          results: STATIC_PLACES,
          mapsHint: "Overpass + Places failed — showing static fallback. Check net/MAPS_API_KEY restrictions/quota.",
        });
      }
    }
    // 3) Honest static fallback (source mock-static).
    console.log("[places] no MAPS_API_KEY + overpass unreachable — static fallback (mock-static)");
    return res.json({
      origin: { lat, lon }, source: "mock-static", error: overpassErr,
      results: STATIC_PLACES,
      mapsHint: "Overpass unreachable — showing static fallback. © OpenStreetMap contributors for live data when online.",
    });
  }
});

// POST /api/sms/log — MSG91/Twilio live when SMS_PROVIDER+SMS_KEY, else in-memory log + queued:true.
app.post("/api/sms/log", async (req, res) => {
  const { phone = "+91-98XXX-XXXX1", message = "", lang = "hi" } = req.body || {};
  const sliced = String(message).slice(0, 320);
  const entry = { id: `sms-${Date.now()}`, phone, message: sliced, lang, at: new Date().toISOString() };
  const cfg = smsConfig();
  if (!cfg.live) {
    smsLogMem.push(entry);
    console.log(`[sms mock -> ${phone}] ${entry.message}`);
    return res.json({ ok: true, ...entry, sent: false, queued: true, provider: "mock-log", source: "mock-log", note: "Simulated. Set SMS_PROVIDER + SMS_KEY for MSG91/Twilio + DLT template." });
  }
  try {
    const live = await sendSmsLive(phone, sliced);
    smsLogMem.push({ ...entry, ...live });
    return res.json({ ok: true, ...entry, ...live, note: `Sent via ${live.provider}.` });
  } catch (e) {
    // Provider failed — keep audit entry and report queued so UI can retry; never silent.
    console.warn(`[sms] ${cfg.provider} failed (${e.message}) — queued`);
    smsLogMem.push({ ...entry, sent: false, queued: true, provider: cfg.provider, source: `${cfg.provider}-error`, error: e.message });
    return res.json({ ok: true, ...entry, sent: false, queued: true, provider: cfg.provider, source: `${cfg.provider}-error`, error: e.message, note: "Provider failed — queued for retry." });
  }
});
app.get("/api/sms/log", (_req, res) => res.json(smsLogMem.slice(-20).reverse()));

// Unknown /api/* -> 404 JSON (must be BEFORE static + SPA fallback, else swallows API contract).
// Keep SPA deep-links working: only /api/* gets JSON 404; other unknown paths still serve index.html below.
app.all("/api/*", (req, res) => res.status(404).json({ error: "unknown api route", path: req.path }));

// Serve Vite build (single-service Cloud Run)
const distDir = path.join(__dirname, process.env.FRONTEND_DIST || "../frontend/dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

app.listen(PORT, () => {
  console.log(`KisaanMitra API on :${PORT} mock=${MOCK} model=${GEMINI_MODEL}`);
  console.log(`[services] weather=open-meteo-live-free${OWM_KEY ? "+owm-key" : ""} mandi=${AGMARKNET_KEY ? "live-try" : "static-csv"} places=overpass-live-free${MAPS_KEY ? "+places-key" : ""} sms=${smsConfig().live ? smsConfig().provider : "mock-log"} firestore=${firestoreConfigured ? "try" : "memory"} genkit=${process.env.ENABLE_GENKIT === "true" ? "try" : "off"}`);
  if (process.env.ENABLE_GENKIT === "true") {
    import("./genkit/agriAdvise.js")
      .then((m) => m.registerAgriAdvise().then((r) => {
        genkitFlow = r;
        console.log(`[genkit] ${r ? "flow active (agriAdvise)" : "not initialised — direct Gemini/mock fallback"}`);
      }))
      .catch((e) => console.warn("[genkit] skip:", e.message));
  }
});
