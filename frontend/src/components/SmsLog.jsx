import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import SourceBadge from "./SourceBadge.jsx";

export default function SmsLog({ lang }) {
  const hi = lang === "hi";
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    // M7 fix: 10s poll (was 3s) + pause when tab hidden + manual refresh. Unmount clears interval.
    const load = () => api("/api/sms/log").then(setLogs).catch(() => {});
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load();
    }, 10000);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const refresh = () => api("/api/sms/log").then(setLogs).catch(() => {});

  return (
    <div className="card text-sm !bg-[#fffdf3]">
      <h3 className="font-display font-extrabold text-khet-950 flex items-center justify-between gap-2">
        <span>
          📩 {hi ? "SMS लॉग" : "SMS log"}{" "}
          <span className="ml-1 align-middle rounded-full bg-khet-950 text-haldi-300 text-[11px] px-2 py-0.5 font-mono">{logs.length}</span>
        </span>
        <button className="btn-sec !min-h-[40px] !py-1 !px-2.5 !text-xs" onClick={refresh}>
          {hi ? "↻ ताज़ा करें" : "↻ Refresh"}
        </button>
      </h3>
      <p className="text-xs text-khet-800/80 font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
        <span>{hi ? "बिना इंटरनेट वालों को यही SMS जाएगा (Hindi)।" : "Offline farmers get this same SMS (Hindi)."}</span>
        {logs[0]?.source || logs[0]?.provider ? <SourceBadge source={logs[0].source || logs[0].provider} /> : null}
      </p>

      {/* Phone-thread style */}
      <div className="mt-2 rounded-2xl border border-khet-200 bg-khet-50/50 overflow-hidden" aria-live="polite" aria-label="SMS thread">
        <div className="flex items-center gap-2 bg-khet-950 text-white px-3 py-2">
          <span className="sms-thread-dot !bg-haldi-400 !text-khet-950" aria-hidden="true">
            📱
          </span>
          <div className="leading-tight">
            <p className="text-xs font-extrabold">KISAAN-MITRA</p>
            <p className="text-[11px] text-white/70 font-mono">VM-KISAAN · {hi ? "ऑफलाइन फॉलबैक" : "offline fallback"}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" /> {hi ? "चालू" : "live"}
          </span>
        </div>
        <ul className="p-2.5 space-y-2 max-h-44 overflow-y-auto">
          {logs.length === 0 && (
            <li className="sms-bubble-in text-xs text-gray-500">
              {hi ? "अभी कोई SMS नहीं — ऊपर फोटो जांच करें, उपाय यहाँ SMS बनकर आएगा।" : "No SMS yet — run a diagnosis above."}
            </li>
          )}
          {logs.map((s) => (
            <li key={s.id} className="flex gap-1.5 items-end">
              <span className="sms-thread-dot !w-7 !h-7 text-sm" aria-hidden="true">
                🌾
              </span>
              <div className="sms-bubble-in max-w-[90%]">
                <p className="font-mono text-[10px] text-khet-700 font-bold">
                  → {s.phone} · {s.at || s.createdAt || "अभी"}
                  {s.queued ? " · queued" : s.sent ? " · sent" : ""}
                  {s.provider ? ` · ${s.provider}` : ""}
                </p>
                <p className="text-[13px] leading-snug text-khet-950">{s.message}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
