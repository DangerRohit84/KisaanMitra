// Firebase web init — safe without keys (demo runs anonymously in mock mode).
// Auth failures are NEVER swallowed: dispatched as window "auth-error" + stored on
// window.__FIREBASE_AUTH_ERROR so App.jsx toast can show them.
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export let authError = null;
export function onAuthError(cb) {
  if (typeof window !== "undefined") window.addEventListener("auth-error", (e) => cb(e.detail));
}
function surfaceAuthError(message) {
  authError = message;
  console.warn("[firebase-auth]", message);
  if (typeof window !== "undefined") {
    window.__FIREBASE_AUTH_ERROR = message;
    window.dispatchEvent(new CustomEvent("auth-error", { detail: message }));
  }
}

let auth = null, db = null;
if (cfg.apiKey) {
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  auth = getAuth(app);
  db = getFirestore(app);
  signInAnonymously(auth).catch((e) => surfaceAuthError(e?.message || "anonymous sign-in failed"));
} else {
  console.log("[firebase] no VITE_FIREBASE_API_KEY — auth/db disabled (mock mode)");
}
export { auth, db };
