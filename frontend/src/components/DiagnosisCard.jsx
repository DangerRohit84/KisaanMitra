import { useRef, useState } from "react";
import { api, compressImage } from "../lib/api.js";
import SourceBadge from "./SourceBadge.jsx";

const CROPS = [
  { id: "soybean", hi: "सोयाबीन", icon: "🌱" },
  { id: "wheat", hi: "गेहूं", icon: "🌾" },
  { id: "maize", hi: "मक्का", icon: "🌽" },
  { id: "cotton", hi: "कपास", icon: "☁️" },
  { id: "onion", hi: "प्याज़", icon: "🧅" },
  { id: "potato", hi: "आलू", icon: "🥔" },
  { id: "tomato", hi: "टमाटर", icon: "🍅" },
  { id: "mustard", hi: "सरसों", icon: "🌼" },
  { id: "gram_chana", hi: "चना", icon: "🫘" },
  { id: "paddy", hi: "धान", icon: "🍚" },
];

// M4 fix: crypto.randomUUID() throws on non-secure http://192.168.x.x LAN demo — fallback keeps Idempotency-Key working.
function newId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* insecure context — fall through */
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function DiagnosisCard({ lang }) {
  const [file, setFile] = useState(null);
  const [crop, setCrop] = useState("soybean");
  const [preview, setPreview] = useState("");
  const [out, setOut] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragOn, setDragOn] = useState(false);
  const [err, setErr] = useState("");
  const [smsState, setSmsState] = useState(null); // null | "sent" | "queued"
  const inputRef = useRef(null);
  const hi = lang === "hi";

  function pick(f) {
    setErr("");
    setOut(null);
    setSmsState(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr(hi ? "सिर्फ फोटो चुनें (JPG/PNG)।" : "Please choose a photo file (JPG/PNG).");
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setErr(hi ? "फोटो 12MB से बड़ी है — छोटी फोटो लें।" : "Photo over 12MB — please take a smaller one.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function diagnose() {
    if (!file) {
      setErr(hi ? "पहले पत्ती की साफ फोटो जोड़ें — फिर निदान करें दबाएं।" : "Add a clear leaf photo first, then press Diagnose.");
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setErr("");
    setSmsState(null);
    try {
      const imageBase64 = await compressImage(file);
      setPreview(imageBase64);
      const data = await api("/api/diagnose", {
        method: "POST",
        headers: { "Idempotency-Key": newId() },
        body: JSON.stringify({ imageBase64, lang, farmId: "farm-1", crop }),
      });
      setOut(data);
      // SMS fallback simulation (Hindi) — mirrors remedy as SMS; isolated try so SMS failure never clobbers diagnosis.
      try {
        const smsRes = await api("/api/sms/log", {
          method: "POST",
          body: JSON.stringify({ message: `पत्ती जांच: ${data.disease} (${Math.round(data.confidence * 100)}%)। ${data.remedy}`, lang }),
        });
        setSmsState(smsRes && smsRes.ok ? "sent" : "queued");
      } catch {
        setSmsState("queued");
      }
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes("413") || msg.includes("too large")) {
        setErr(hi ? "फोटो बड़ी है — दोबारा छोटी करके भेजें।" : "Photo too large — retry with a smaller one.");
      } else if (msg.includes("Failed to fetch") || msg.includes("Network")) {
        setErr(hi ? "नेट नहीं है — SMS पर उपाय भेज देंगे। दोबारा कोशिश करें।" : "No network — we'll SMS the remedy. Retry.");
      } else {
        setErr(msg);
      }
      setOut({ error: msg });
    } finally {
      setLoading(false);
    }
  }

  const confPct = out && !out.error ? Math.round(out.confidence * 100) : 0;

  return (
    <div className="card !p-0 overflow-hidden">
      {/* Card hero strip */}
      <div className="bg-khet-950 text-white px-4 sm:px-5 pt-4 pb-3">
        <p className="text-[11px] font-bold tracking-widest uppercase text-haldi-300">
          {hi ? "Step 1 · 30 सेकंड" : "Step 1 · 30 seconds"}
        </p>
        <h2 className="font-display text-xl sm:text-2xl font-extrabold leading-tight">
          📷 {hi ? "पत्ती फोटो जांच" : "Leaf diagnosis"}
        </h2>
        <p className="text-sm text-white/75">{hi ? "साफ पत्ती + अच्छी रोशनी = सही निदान" : "Clear leaf + good light = accurate diagnosis"}</p>
      </div>

      <div className="p-4 sm:p-5">
        {/* Crop chips */}
        <p id="crop-label" className="text-sm font-bold text-khet-950">
          {hi ? "फसल चुनें" : "Select crop"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-labelledby="crop-label">
          {CROPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={crop === c.id}
              onClick={() => setCrop(c.id)}
            >
              <span aria-hidden="true">{c.icon}</span> {hi ? c.hi : c.id}
            </button>
          ))}
        </div>

        {/* Hero dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-label={hi ? "पत्ती फोटो जोड़ें — क्लिक या ड्रॉप करें" : "Add leaf photo — click or drop"}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOn(true);
          }}
          onDragLeave={() => setDragOn(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOn(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`mt-3 rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition min-h-[132px] flex flex-col items-center justify-center gap-1 ${
            dragOn ? "border-khet-600 bg-khet-50 scale-[1.01]" : "border-khet-300 bg-khet-50/60 hover:bg-khet-50"
          }`}
        >
          <span className="text-3xl" aria-hidden="true">
            {preview ? "✅" : "📸"}
          </span>
          <span className="font-display font-bold text-khet-950">
            {preview ? (hi ? "फोटो तैयार — बदलने के लिए दबाएं" : "Photo ready — tap to change") : hi ? "फोटो खींचें / चुनें" : "Take / choose photo"}
          </span>
          <span className="text-xs text-khet-800/70 font-medium">{hi ? "क्लिक करें या यहाँ फोटो डालें · JPG/PNG" : "Tap or drop photo here · JPG/PNG"}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={hi ? "पत्ती फोटो फाइल" : "Leaf photo file"}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </div>

        <button className="btn w-full mt-3 !text-lg !py-3.5" onClick={diagnose} disabled={loading} aria-busy={loading}>
          {loading ? (hi ? "🔍 जांच हो रही…" : "🔍 Analysing…") : hi ? "निदान करें" : "Diagnose"}
        </button>
        {!file && !err && (
          <p className="text-xs text-center text-khet-800/70 mt-1.5 font-medium">{hi ? "👆 पहले फोटो जोड़ें" : "👆 Add a photo first"}</p>
        )}

        {/* Guided error */}
        {err && (
          <p role="alert" className="mt-2 text-sm font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            💡 {err}
          </p>
        )}

        {/* Preview + scan */}
        {preview && (
          <div className={`mt-3 rounded-2xl overflow-hidden border border-khet-200 ${loading ? "scan-box" : ""}`}>
            <img src={preview} alt={hi ? "पत्ती की फोटो" : "leaf photo"} className="w-full max-h-56 object-cover" />
            {loading && (
              <p className="text-center text-xs font-bold text-khet-800 bg-haldi-100 py-1.5" aria-live="polite">
                {hi ? "AI पत्ती की नसें देख रहा…" : "AI is reading leaf veins…"}
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {loading && !out && (
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        )}

        {out && !out.error && (
          <div className="mt-3 text-sm space-y-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={out.source || (out.model === "mock" ? "mock" : "gemini-live")} />
              <span className="font-mono text-[11px] text-gray-500">
                {out.model || ""}{out.store ? ` · ${out.store}${out.persist ? "" : " (no persist)"}` : ""}
                {out.latencyMs ? ` · ${out.latencyMs}ms` : ""}
              </span>
            </div>
            {out.rawFallback && (
              <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                ⚠️ {hi ? "AI ने JSON नहीं दिया — कच्चा जवाब दिख रहा है।" : "AI returned prose, not JSON — showing raw text."}
              </p>
            )}
            <p className="text-base">
              <b>{hi ? "बीमारी:" : "Disease:"}</b> <span className="font-display font-bold text-khet-900">{out.disease}</span>{" "}
              {out.confidence < 0.7 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-haldi-100 border border-haldi-400/60 px-2 py-0.5 text-xs font-bold text-haldi-800">
                  ⚠️ {hi ? "संदिग्ध — दोबारा फोटो लें" : "suspected"}
                </span>
              )}
            </p>
            {/* Vein health meter */}
            <div>
              <div className="flex justify-between text-xs font-bold text-khet-900">
                <span>{hi ? "पत्ती सेहत" : "Leaf health"}</span>
                <span className="font-mono">{confPct}%</span>
              </div>
              <div className="vein-meter mt-1" role="img" aria-label={`${hi ? "विश्वास" : "Confidence"} ${confPct}%`}>
                <span className="vein-needle" style={{ left: `${Math.min(98, Math.max(2, confPct))}%` }} />
              </div>
            </div>
            <p className="bg-khet-50 border border-khet-200 rounded-xl px-3 py-2">
              <b>{hi ? "💊 उपाय:" : "💊 Remedy:"}</b> {out.remedy}
            </p>
            <p>
              <b>{hi ? "मात्रा:" : "Dosage:"}</b> <span className="font-mono text-[13px] bg-gray-100 rounded px-1.5 py-0.5">{out.dosage}</span>
            </p>
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">⚠️ {out.disclaimer}</p>
            {smsState === "sent" && (
              <p className="text-xs text-khet-800 font-semibold">📩 {hi ? "यही उपाय SMS से भी भेज दिया।" : "Same remedy sent via SMS too."}</p>
            )}
            {smsState === "queued" && (
              <p className="text-xs text-khet-800 font-semibold">📩 {hi ? "SMS कतार में है — नेटवर्क आने पर भेजा जाएगा।" : "SMS queued — will send when online."}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
