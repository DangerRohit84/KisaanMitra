import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import SourceBadge from "./SourceBadge.jsx";

const CROPS = ["soybean", "wheat", "maize", "cotton", "onion", "potato", "tomato", "mustard", "gram_chana", "paddy"];
const HI_CROP = { soybean: "सोयाबीन", wheat: "गेहूं", maize: "मक्का", cotton: "कपास", onion: "प्याज़", potato: "आलू", tomato: "टमाटर", mustard: "सरसों", gram_chana: "चना", paddy: "धान" };

export default function WeatherMandi({ lang }) {
  const hi = lang === "hi";
  const [w, setW] = useState(null);
  const [mandi, setMandi] = useState(null);
  const [mandiErr, setMandiErr] = useState("");
  const [crop, setCrop] = useState("soybean");
  const [prices, setPrices] = useState({});

  useEffect(() => {
    api("/api/weather?lat=22.7196&lon=75.8577")
      .then(setW)
      .catch(() => {});
  }, []);
  useEffect(() => {
    // H1 regression guard: /api/mandi?crop=bogus now 404s — show "भाव उपलब्ध नहीं" instead of stale soybean price.
    setMandi(null);
    setMandiErr("");
    api(`/api/mandi?crop=${crop}`)
      .then((d) => {
        setMandi(d);
        setMandiErr("");
      })
      .catch((e) => setMandiErr(String(e.message || e)));
  }, [crop]);

  useEffect(() => {
    // Ticker needs all 10 crops — fetch once from mock CSV-backed /api/mandi (no keys needed).
    let cancelled = false;
    Promise.all(
      CROPS.map((c) => api(`/api/mandi?crop=${c}`).then((d) => [c, d.price]).catch(() => null))
    ).then((pairs) => {
      if (cancelled) return;
      const m = {};
      for (const p of pairs) if (p) m[p[0]] = p[1];
      setPrices(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tickerItems = CROPS.map((c) => ({ c, price: prices[c] ?? (mandi && c === crop ? mandi.price : "···") }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card text-sm">
        <h3 className="font-display font-extrabold text-khet-950">🌦️ {hi ? "मौसम (इंदौर)" : "Weather (Indore)"}</h3>
        {!w ? (
          <div className="mt-2 space-y-2" aria-label={hi ? "मौसम लोड हो रहा" : "Loading weather"}>
            <div className="skeleton h-8 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-12 w-full" />
          </div>
        ) : (
          <>
            <p className="font-display text-3xl font-extrabold text-khet-950">
              {w.tempC}°C <span className="text-base font-bold text-khet-700">· {w.desc}</span>
            </p>
            <p className="font-semibold text-khet-900">
              💧 {w.humidity}% · 🌬️ {w.wind} m/s {w.cached ? <span className="text-xs bg-gray-100 rounded px-1">(cached)</span> : ""}
            </p>
            {w.advisory && <p className="text-xs bg-monsoon-50 border border-monsoon-200 text-monsoon-900 p-2.5 rounded-xl mt-2">☔ {w.advisory}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={w.source} cached={w.cached} />
              <span className="font-mono text-[11px] text-gray-500">cached 1h (singleflight){w.error ? ` · ${w.error}` : ""}</span>
            </p>
            {w.source === "owm-error" && (
              <p className="text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 mt-1.5">
                ⚠️ {hi ? "मौसम सर्वर फेल — फॉलबैक दिख रहा है, key/quota जांचें।" : "Weather API failed — showing fallback, check key/quota."}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card text-sm !bg-khet-950 !border-khet-950 text-white overflow-hidden">
        <h3 className="font-display font-extrabold">🧺 {hi ? "मंडी भाव" : "Mandi price"}</h3>
        <label className="sr-only" htmlFor="mandi-crop">
          {hi ? "फसल चुनें" : "Choose crop"}
        </label>
        <select
          id="mandi-crop"
          className="border border-haldi-400/60 bg-white text-khet-950 rounded-xl px-2 py-2 my-2 w-full font-bold min-h-[44px]"
          value={crop}
          onChange={(e) => setCrop(e.target.value)}
        >
          {CROPS.map((c) => (
            <option key={c} value={c}>
              {hi ? HI_CROP[c] : c} {c === crop ? "●" : ""}
            </option>
          ))}
        </select>
        {!mandi && !mandiErr ? (
          <div className="space-y-2" aria-label={hi ? "भाव लोड हो रहा" : "Loading price"}>
            <div className="skeleton h-9 w-1/2 !bg-white/10" />
            <div className="skeleton h-4 w-full !bg-white/10" />
          </div>
        ) : mandiErr ? (
          <p role="alert" className="text-sm font-semibold text-haldi-200">
            {hi ? `भाव उपलब्ध नहीं (${HI_CROP[crop] || crop})` : `Price unavailable (${crop})`} — <span className="font-mono text-[11px]">{mandiErr}</span>
          </p>
        ) : (
          <>
            <p className="font-display text-3xl font-extrabold text-haldi-300">
              ₹{mandi.price}
              <span className="text-base text-white/70">/{mandi.unit}</span>
            </p>
            <p className="text-white/85 font-semibold">
              {mandi.market} · {mandi.updatedAt}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={mandi.source} stale={mandi.stale} extra={mandi.staleDays != null ? `${mandi.staleDays}d old` : ""} />
            </p>
            {(mandi.warning || mandi.stale) && (
              <p className="text-xs font-semibold text-haldi-200 bg-white/10 border border-haldi-400/40 rounded-xl px-2.5 py-1.5 mt-1.5">
                ⚠️ {mandi.warning || (hi ? `CSV ${mandi.staleDays ?? "?"} दिन पुराना — live के लिए AGMARKNET_KEY जोड़ें।` : `CSV ${mandi.staleDays ?? "?"}d old — set AGMARKNET_KEY for live.`)}
              </p>
            )}
            {mandi.liveError && <p className="font-mono text-[11px] text-white/50">live failed: {mandi.liveError} — CSV fallback</p>}
          </>
        )}

        {/* Haldi ticker */}
        <div className="ticker-wrap mt-3 -mx-4 sm:-mx-5 bg-haldi-400 text-khet-950" aria-label={hi ? "सभी फसल भाव पट्टी" : "All crop price ticker"}>
          <div className="ticker-track py-1.5 text-xs font-extrabold whitespace-nowrap">
            {[0, 1].map((dup) => (
              <span key={dup} aria-hidden={dup === 1}>
                {tickerItems.map((t) => (
                  <span key={`${dup}-${t.c}`} className="mx-3 inline-flex items-center gap-1">
                    <span aria-hidden="true">●</span> {hi ? HI_CROP[t.c] : t.c} ₹{t.price}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
