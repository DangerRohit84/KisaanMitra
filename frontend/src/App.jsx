import { useEffect, useState } from "react";
import DiagnosisCard from "./components/DiagnosisCard.jsx";
import ChatBox from "./components/ChatBox.jsx";
import WeatherMandi from "./components/WeatherMandi.jsx";
import MapView from "./components/MapView.jsx";
import SmsLog from "./components/SmsLog.jsx";

const COPY = {
  hi: {
    eyebrow: "इंदौर पायलट · 1 FPO × 50 किसान",
    h1a: "पत्ती दिखाओ,",
    h1b: "उपाय पाओ।",
    sub: "फोटो खींचो → AI निदान → हिंदी उपाय + SMS। मौसम-मंडी साथ में। KCC 1800-180-1551 पर मुफ्त सलाह।",
    cta1: "📷 निदान करें",
    cta2: "🎙️ बोलकर पूछें",
    trust: "Gemini 1.5 Flash · Firebase · Cloud Run · Maps · Genkit agriAdvise",
    steps: ["फोटो लो", "निदान पाओ", "उपाय + SMS"],
  },
  en: {
    eyebrow: "Indore pilot · 1 FPO × 50 farmers",
    h1a: "Show a leaf,",
    h1b: "get the cure.",
    sub: "Snap → AI diagnosis → Hindi remedy + SMS. Weather + mandi included. Free advice on KCC 1800-180-1551.",
    cta1: "📷 Diagnose now",
    cta2: "🎙️ Ask by voice",
    trust: "Gemini 1.5 Flash · Firebase · Cloud Run · Maps · Genkit agriAdvise",
    steps: ["Snap", "Diagnose", "Remedy + SMS"],
  },
};

export default function App() {
  const [lang, setLang] = useState("hi");
  const [authErr, setAuthErr] = useState(() => (typeof window !== "undefined" && window.__FIREBASE_AUTH_ERROR) || "");
  useEffect(() => {
    const h = (e) => setAuthErr(e.detail || "auth failed");
    window.addEventListener("auth-error", h);
    return () => window.removeEventListener("auth-error", h);
  }, []);
  const t = COPY[lang];

  return (
    <div className="min-h-screen">
      <a href="#nidan" className="skip-link">
        {lang === "hi" ? "मुख्य निदान पर जाएं" : "Skip to diagnosis"}
      </a>

      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b border-khet-900/10 bg-[#f6f7ee]/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-3 sm:px-5 h-16 flex items-center justify-between gap-2">
          <a href="#top" className="flex items-center gap-2 min-h-[44px]" aria-label="KisaanMitra home">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-khet-950 text-2xl" aria-hidden="true">
              🌾
            </span>
            <span className="leading-tight">
              <span className="font-display block text-lg font-extrabold text-khet-950">किसानमित्र</span>
              <span className="block text-[11px] font-semibold tracking-wide text-khet-700 uppercase">
                Kisan Alert · Agri Intelligence
              </span>
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-4 text-sm font-semibold text-khet-900" aria-label="Sections">
            <a className="hover:underline min-h-[44px] inline-flex items-center" href="#nidan">
              {lang === "hi" ? "निदान" : "Diagnosis"}
            </a>
            <a className="hover:underline min-h-[44px] inline-flex items-center" href="#mitra">
              {lang === "hi" ? "सहायक" : "Mitra"}
            </a>
            <a className="hover:underline min-h-[44px] inline-flex items-center" href="#mausam">
              {lang === "hi" ? "मौसम-मंडी" : "Weather"}
            </a>
            <a className="hover:underline min-h-[44px] inline-flex items-center" href="#sms">
              SMS
            </a>
          </nav>
          <div className="flex gap-1.5" role="group" aria-label={lang === "hi" ? "भाषा चुनें" : "Choose language"}>
            <button
              className={lang === "hi" ? "btn !min-h-[40px] !py-1.5 !px-3 text-sm" : "btn-sec !min-h-[40px] !py-1.5 !px-3 text-sm"}
              onClick={() => setLang("hi")}
              aria-pressed={lang === "hi"}
            >
              हिंदी
            </button>
            <button
              className={lang === "en" ? "btn !min-h-[40px] !py-1.5 !px-3 text-sm" : "btn-sec !min-h-[40px] !py-1.5 !px-3 text-sm"}
              onClick={() => setLang("en")}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-6xl px-3 sm:px-5 pb-10">
        {/* Auth failure toast — firebase.js never swallows sign-in errors */}
        {authErr && (
          <div role="alert" className="auth-toast">
            <span aria-hidden="true">🔐</span>
            <span className="flex-1">
              {lang === "hi" ? `लॉगिन में दिक्कत: ${authErr} — बिना लॉगिन जारी रख सकते हैं।` : `Auth issue: ${authErr} — you can continue without login.`}
            </span>
            <button type="button" className="auth-toast-x" onClick={() => setAuthErr("")} aria-label={lang === "hi" ? "बंद करें" : "Dismiss"}>
              ✕
            </button>
          </div>
        )}
        {/* Hero */}
        <section className="pt-5 sm:pt-8" aria-labelledby="hero-h1">
          <span className="eyebrow">🌱 {t.eyebrow}</span>
          <div className="mt-3 grid gap-5 lg:grid-cols-12 items-end">
            <div className="lg:col-span-7">
              <h1 id="hero-h1" className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05] text-khet-950">
                {t.h1a} <span className="text-khet-600 underline decoration-haldi-400 decoration-[6px] underline-offset-4">{t.h1b}</span>
              </h1>
              <p className="mt-3 max-w-xl text-base sm:text-lg text-khet-900/80 font-medium">{t.sub}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <a href="#nidan" className="btn text-base !px-6 !py-3 inline-flex items-center gap-2">
                  {t.cta1}
                </a>
                <a href="#mitra" className="btn-haldi text-base !px-6 !py-3 inline-flex items-center gap-2">
                  {t.cta2}
                </a>
              </div>
              <ol className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-khet-900" aria-label={lang === "hi" ? "कैसे काम करता है" : "How it works"}>
                {t.steps.map((s, i) => (
                  <li key={s} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-khet-200 px-3 py-1.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-khet-950 text-white text-xs">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
            <div className="lg:col-span-5">
              <div className="card !bg-khet-950 !border-khet-950 text-white relative overflow-hidden">
                <div className="absolute -right-8 -top-8 text-[120px] opacity-15 select-none" aria-hidden="true">
                  🌿
                </div>
                <p className="text-xs font-bold tracking-widest uppercase text-haldi-300">⚡ {lang === "hi" ? "आज का हाल" : "Today"}</p>
                <p className="font-display mt-1 text-2xl font-bold leading-snug">
                  {lang === "hi" ? "सोयाबीन में पीला मोज़ेक? देर न करें।" : "Yellow mosaic in soybean? Act early."}
                </p>
                <p className="mt-1 text-sm text-white/80">
                  {lang === "hi"
                    ? "सुबह 9 बजे से पहले छिड़काव सबसे असरदार। नीचे फोटो जांचें।"
                    : "Spray before 9 AM works best. Check with a photo below."}
                </p>
                <p className="mt-3 font-mono text-[11px] text-white/60">{t.trust}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Diagnosis-first 12-col grid */}
        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <section id="nidan" aria-label={lang === "hi" ? "पत्ती निदान" : "Leaf diagnosis"} className="lg:col-span-7 scroll-mt-20">
            <DiagnosisCard lang={lang} />
          </section>
          <div className="lg:col-span-5 grid gap-4 content-start">
            <section id="mitra" aria-label={lang === "hi" ? "सहायक" : "Assistant"} className="scroll-mt-20">
              <ChatBox lang={lang} />
            </section>
            <section id="sms" aria-label="SMS log" className="scroll-mt-20">
              <SmsLog lang={lang} />
            </section>
          </div>
          <section id="mausam" aria-label={lang === "hi" ? "मौसम और मंडी" : "Weather and mandi"} className="lg:col-span-7 scroll-mt-20">
            <WeatherMandi lang={lang} />
          </section>
          <section aria-label={lang === "hi" ? "नजदीकी मंडी" : "Nearby mandis"} className="lg:col-span-5">
            <MapView lang={lang} />
          </section>
        </div>
      </main>

      {/* KCC footer */}
      <footer className="border-t border-khet-900/10 bg-khet-950 text-white">
        <div className="mx-auto max-w-6xl px-3 sm:px-5 py-6 grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="font-display text-lg font-bold">🌾 किसानमित्र</p>
            <p className="text-white/70 text-xs mt-1">Kisan Alert · Agri Intelligence · Indore pilot: 1 FPO × 50 farmers</p>
          </div>
          <div className="text-xs space-y-1 text-white/80">
            <p>
              📞 KCC (किसान कॉल सेंटर):{" "}
              <a href="tel:18001801551" className="font-bold text-haldi-300 underline">
                1800-180-1551
              </a>{" "}
              (मुफ्त)
            </p>
            <p>⚠️ AI सलाह है — कीटनाशक से पहले कृषि अधिकारी / लेबल ज़रूर देखें।</p>
          </div>
          <div className="text-[11px] font-mono text-white/60">
            <p>Gemini 1.5 Flash · Firebase · Cloud Run · Maps · Genkit flow agriAdvise · SMS fallback</p>
            <p className="mt-1">Idempotency-Key · singleflight cache · DLT-ready</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
