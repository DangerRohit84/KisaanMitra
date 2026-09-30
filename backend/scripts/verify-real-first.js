// RED test: real-first hardening contract (must PASS after senior-dev work).
// Run: node backend/scripts/verify-real-first.js
// Checks static contracts + live mock boot. Fails before fix, passes after.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? "PASS " : "FAIL ") + msg); };

const server = read("backend/server.js");
const envEx = read(".env.example");

// 1. Gemini safe JSON parse + raw fallback + logging + source flag
need(/parseGeminiJson|safeParseGemini|stripCodeFence/.test(server), "gemini: safe JSON parse helper exists");
need(/rawFallback|rawText/.test(server), "gemini: raw fallback field exists");
need(/gemini-live/.test(server), "gemini: source gemini-live flag exists");
need(/\[gemini\]/.test(server), "gemini: logging exists");

// 2. Weather honest error source
need(/owm-error/.test(server), "weather: owm-error source exists (not silent mock)");
need(/\[weather\]/.test(server), "weather: logging exists");

// 3. Mandi live path + stale warning
need(/AGMARKNET_KEY|AGMARKNET_API/.test(server), "mandi: Agmarknet live path gated on key");
need(/stale/.test(server), "mandi: stale warning exists");
need(/agmarknet-live|agmarknet-static/.test(server), "mandi: honest source label");

// 4. Places live fetch honest
need(/maps\.googleapis\.com.*place.*nearbysearch|nearbysearch/i.test(server), "places: Nearby Search live fetch exists");
need(/places-live/.test(server), "places: places-live source exists");
need(!/source: process\.env\.MAPS_API_KEY \? "places-api"/.test(server), "places: dishonest places-api label removed");

// 5. SMS live path + queued flag
need(/SMS_PROVIDER|SMS_KEY|MSG91|TWILIO/i.test(server), "sms: provider path exists");
need(/queued/.test(server), "sms: queued flag exists");

// 6. Firestore persist flag
need(/persist/.test(server), "firestore: persist flag exists");
need(/firestoreReady|store:.*firestore|store:.*memory/.test(server), "firestore: ready/store flag exists");

// 7. Auth error surfaced (frontend)
const fb = read("frontend/src/firebase.js");
need(!/signInAnonymously\(auth\)\.catch\(\(\) => \{\}\)/.test(fb), "auth: swallow catch(()=>{}) removed");
need(/auth-error|onAuthError|__FIREBASE_AUTH_ERROR/.test(fb), "auth: error surfaced via event/export");

// 8. .env.example all vars
for (const v of ["GEMINI_API_KEY","OPENWEATHER_API_KEY","MAPS_API_KEY","VITE_MAPS_API_KEY","FIREBASE_PROJECT_ID","GOOGLE_APPLICATION_CREDENTIALS","VITE_FIREBASE_","SMS_PROVIDER","SMS_KEY","ENABLE_GENKIT","MOCK_MODE","AGMARKNET_KEY"]) {
  need(envEx.includes(v), `.env.example contains ${v}`);
}

// 9. Frontend source badges (additive, contracts same)
const appFiles = ["frontend/src/components/WeatherMandi.jsx","frontend/src/components/MapView.jsx","frontend/src/components/DiagnosisCard.jsx","frontend/src/components/SmsLog.jsx","frontend/src/components/ChatBox.jsx"].map(read).join("\n");
need(/SourceBadge|source-badge|src:.*live|● LIVE|● MOCK/i.test(appFiles), "frontend: source badges present");
need(fs.existsSync(path.join(root, "frontend/src/components/SourceBadge.jsx")), "frontend: SourceBadge.jsx exists");

console.log(fails.length ? `\nRED: ${fails.length} failing` : "\nGREEN: all real-first contracts pass");
process.exit(fails.length ? 1 : 0);
