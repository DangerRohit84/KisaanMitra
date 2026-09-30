import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import SourceBadge from "./SourceBadge.jsx";

// Maps JS + Places (prod). Day1: list from /api/mandis/nearby + optional map iframe if key present.
export default function MapView({ lang, lat: latProp, lon: lonProp }) {
  const hi = lang === "hi";
  const [places, setPlaces] = useState([]);
  const [src, setSrc] = useState("");
  const [srcErr, setSrcErr] = useState("");
  const [coords, setCoords] = useState({ lat: latProp ?? 22.7196, lon: lonProp ?? 75.8577 });
  const key = import.meta.env.VITE_MAPS_API_KEY;

  useEffect(() => {
    // Prefer explicit farm geo props; else try device geolocation once, else Indore default.
    if (latProp !== undefined && lonProp !== undefined) {
      setCoords({ lat: latProp, lon: lonProp });
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }), () => {}, {
        timeout: 5000,
      });
    }
  }, [latProp, lonProp]);

  useEffect(() => {
    api(`/api/mandis/nearby?lat=${coords.lat}&lon=${coords.lon}`)
      .then((d) => { setPlaces(d.results || []); setSrc(d.source || ""); setSrcErr(d.error || ""); })
      .catch(() => {});
  }, [coords.lat, coords.lon]);

  // M3 fix: dynamic map query from farm geo (was hardcoded Indore). Key needs HTTP-referrer lock — see README deploy notes.
  const mapQuery = `mandi+near+${coords.lat},${coords.lon}`;

  return (
    <div className="card text-sm h-full">
      <h3 className="font-display font-extrabold text-khet-950">🗺️ {hi ? "नजदीकी मंडी / दुकान" : "Nearby mandis / stores"}</h3>
      <p className="mt-1 flex flex-wrap items-center gap-1.5">
        {src && <SourceBadge source={src} extra={srcErr} />}
      </p>
      {key ? (
        <iframe
          title={hi ? "नजदीकी मंडी नक्शा" : "Nearby mandi map"}
          className="w-full h-48 rounded-2xl mt-2 border border-khet-200"
          src={`https://www.google.com/maps/embed/v1/search?key=${key}&q=${mapQuery}`}
          loading="lazy"
        />
      ) : (
        <p className="text-xs font-semibold text-khet-800 bg-khet-50 border border-khet-200 rounded-xl px-2.5 py-2 mt-2">
          🛰️ {hi ? "Map key नहीं है — सूची मोड (mock)। Key जोड़ने पर live map + Places दिखेगा।" : "No map key — list mode (mock). Add key for live map + Places."}
        </p>
      )}
      <ul className="mt-2.5 space-y-2 max-h-56 overflow-y-auto pr-0.5" aria-label={hi ? "मंडी सूची" : "Mandi list"}>
        {places.length === 0 && (
          <li className="skeleton h-12 w-full" aria-label={hi ? "सूची लोड हो रही" : "Loading list"} />
        )}
        {places.map((p, i) => (
          <li
            key={i}
            className="flex items-center gap-2.5 rounded-2xl border border-khet-200 bg-white px-3 py-2.5 hover:border-khet-500 hover:shadow-card transition"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-khet-950 text-lg" aria-hidden="true">
              {p.type === "input_store" || p.type === "agri_store" ? "🏪" : "📍"}
            </span>
            <span className="flex-1 min-w-0">
              <b className="block truncate text-khet-950">{p.name}</b>
              <span className="text-xs font-semibold text-khet-700">
                {p.type === "input_store" || p.type === "agri_store" ? (hi ? "बीज-दवा दुकान" : "input store") : hi ? "मंडी" : "mandi"} · {p.distKm} km
              </span>
            </span>
            <a
              className="btn-sec !min-h-[40px] !py-1 !px-2.5 !text-xs shrink-0 no-underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.name + " mandi")}&origin=${coords.lat},${coords.lon}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${hi ? "रास्ता" : "Directions"} — ${p.name}`}
            >
              🧭 {hi ? "रास्ता" : "Go"}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-mono text-[11px] text-gray-500">
        {coords.lat.toFixed(3)}, {coords.lon.toFixed(3)} · /api/mandis/nearby
      </p>
    </div>
  );
}
