// Seed helper: prints seed.json + optionally pushes to Firestore if Admin creds exist.
// Usage: npm run seed  OR  node scripts/seed.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "seed.json"), "utf8"));

console.log("=== KisaanMitra seed (offline) ===");
console.log(JSON.stringify(seed, null, 2));

if (process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const admin = (await import("firebase-admin")).default;
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  }
  const db = admin.firestore();
  for (const u of seed.users) await db.doc(`users/${u.id}`).set(u, { merge: true });
  for (const f of seed.farms) await db.doc(`farms/${f.id}`).set(f, { merge: true });
  for (const d of seed.diagnoses) await db.doc(`diagnoses/${d.id}`).set(d, { merge: true });
  for (const m of seed.mandiCache) await db.doc(`mandiCache/${m.crop}`).set({ ...m }, { merge: true });
  console.log("Pushed seed to Firestore.");
} else {
  console.log("No Firebase creds - skipped Firestore push (app runs on in-memory + CSV).");
}
