import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import SourceBadge from "./SourceBadge.jsx";

const QUICK = [
  { hi: "मौसम कैसा है?", en: "How is weather?" },
  { hi: "सोयाबीन भाव?", en: "Soybean rate?" },
  { hi: "पीला पत्ता क्यों?", en: "Yellow leaves why?" },
];

export default function ChatBox({ lang }) {
  const hi = lang === "hi";
  const [msgs, setMsgs] = useState([
    { role: "mitra", text: hi ? "नमस्ते! मैं किसानमित्र हूँ। फसल, मौसम या मंडी पूछें — बोलकर भी।" : "Hello! I'm KisaanMitra. Ask about crop, weather, mandi." },
  ]);
  const [inp, setInp] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [src, setSrc] = useState("");
  const scrollRef = useRef(null);
  // Single-flight guards for voice (fix mic double-send):
  // - recRef holds the one active SpeechRecognition (toggle-stop, no overlap)
  // - busyRef mirrors `busy` synchronously (React state is async/stale in closures)
  // - lastVoiceRef dedupes repeat onresult fires of the same utterance
  const recRef = useRef(null);
  const busyRef = useRef(false);
  const lastVoiceRef = useRef({ text: "", at: 0 });
  // Voice buffer: browsers fire onresult 1..N times per utterance (first fire
  // is often partial — e.g. single word). Sending on first fire locks busyRef
  // and drops the full transcript. Buffer across fires; send once onend.
  const voiceAccumRef = useRef("");
  const voiceSentRef = useRef(false);

  useEffect(() => {
    setMsgs([
      { role: "mitra", text: hi ? "नमस्ते! मैं किसानमित्र हूँ। फसल, मौसम या मंडी पूछें — बोलकर भी।" : "Hello! I'm KisaanMitra. Ask about crop, weather, mandi." },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, busy]);

  // Abort any live recognition on unmount (no leaked rec firing send after nav).
  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort?.();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, []);

  async function send(text) {
    const t = (text ?? inp).trim();
    // busyRef = synchronous single-flight (fixes stale-closure double send:
    // two send() calls in the same tick both saw busy=false and both posted).
    if (!t || busyRef.current) return;
    busyRef.current = true;
    setInp("");
    setBusy(true);
    const hist = [...msgs.slice(-6).map((m) => ({ role: m.role, text: m.text })), { role: "user", text: t }];
    setMsgs((m) => [...m, { role: "user", text: t }]);
    try {
      const r = await api("/api/chat", { method: "POST", body: JSON.stringify({ text: t, lang, history: hist }) });
      setSrc(r.source || (r.model === "mock" ? "mock" : "gemini-live"));
      setMsgs((m) => [...m, { role: "mitra", text: `${r.reply}\n\n⚠️ ${r.disclaimer}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "mitra", text: hi ? "नेटवर्क दिक्कत — SMS पर भेज देंगे।" : "Network issue — we'll SMS it." }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    // M5 fix: no blocking alert(); inline hint + onerror/onend always reset listening (low-end/battery browsers).
    if (!SR) {
      setVoiceHint(hi ? "इस ब्राउज़र में वॉइस नहीं है — लिखकर पूछें।" : "Voice not supported here — please type.");
      return;
    }
    // Toggle-stop uses recRef as source of truth (not stale `listening` state:
    // fast double-tap sees listening=false and would start a 2nd rec).
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {
        /* ignore — onend will reset state */
      }
      return;
    }
    // Busy feedback (not silent death): mic stays enabled so user gets a hint
    // instead of tapping a disabled button with no explanation. send() still
    // single-flights via busyRef, so no duplicate POST can slip through.
    if (busyRef.current || busy) {
      setVoiceHint(hi ? "जवाब आ रहा है — थोड़ा रुककर दोबारा बोलें।" : "Answer loading — wait, then try again.");
      return;
    }
    setVoiceHint("");
    const rec = new SR();
    rec.lang = hi ? "hi-IN" : "en-IN";
    // Single-shot utterance: no continuous loop, no interim sends.
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;
    // New utterance session — reset buffer + sent flag.
    voiceAccumRef.current = "";
    voiceSentRef.current = false;
    setListening(true);
    rec.onresult = (e) => {
      // Buffer, don't send: first fire is often partial (1 word). Join ALL
      // SpeechRecognitionResults within this event (multi-segment split fix),
      // keep the longest buffer across fires, send once onend/isFinal.
      // Interim fallback: some WebViews never set isFinal=true with
      // interimResults=false — onend below is the guaranteed send path.
      const transcript = Array.from(e.results || [])
        .map((r) => r?.[0]?.transcript || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!transcript) return;
      if (transcript.length >= voiceAccumRef.current.length) {
        voiceAccumRef.current = transcript;
      }
      // Fast path: final result available — send now for instant UI.
      // onend guard (voiceSentRef) prevents the double-send ("multiple").
      let isFinal = false;
      try {
        isFinal = !!e.results?.[e.results.length - 1]?.isFinal;
      } catch {
        isFinal = false;
      }
      if (isFinal) {
        const now = Date.now();
        if (transcript === lastVoiceRef.current.text && now - lastVoiceRef.current.at < 1500) return;
        if (voiceSentRef.current) return;
        voiceSentRef.current = true;
        lastVoiceRef.current = { text: transcript, at: now };
        const toSend = voiceAccumRef.current || transcript;
        voiceAccumRef.current = "";
        send(toSend);
      }
    };
    rec.onerror = (e) => {
      recRef.current = null;
      setListening(false);
      setVoiceHint(hi ? `वॉइस रुकी (${e.error || "error"}) — दोबारा दबाएं या लिखें।` : `Voice stopped (${e.error || "error"}) — retry or type.`);
      // Don't clear voiceAccumRef here — onend fires after onerror and is
      // the single send point; clearing here would drop the transcript.
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      // Single send point: full buffered transcript, no space-split.
      const t = (voiceAccumRef.current || "").trim();
      voiceAccumRef.current = "";
      if (!t) return;
      if (voiceSentRef.current) return; // already sent via isFinal fast-path
      voiceSentRef.current = true;
      // Dedupe: some browsers fire onresult+onend twice for same utterance.
      const now = Date.now();
      if (t === lastVoiceRef.current.text && now - lastVoiceRef.current.at < 1500) return;
      lastVoiceRef.current = { text: t, at: now };
      send(t);
    };
    try {
      rec.start();
    } catch {
      recRef.current = null;
      setListening(false);
      setVoiceHint(hi ? "वॉइस शुरू नहीं हुई — दोबारा दबाएं या लिखें।" : "Voice did not start — retry or type.");
    }
  }

  return (
    <div className="card">
      <h2 className="font-display text-lg font-extrabold text-khet-950">💬 {hi ? "सहायक से पूछें" : "Ask Mitra"}</h2>
      <p className="text-xs text-khet-800/70 font-medium flex items-center gap-2 flex-wrap">
        <span>{hi ? "हिंदी में बोलें या लिखें" : "Speak or type in Hindi"}</span>
        {src && <SourceBadge source={src} />}
      </p>

      {/* Live region for screen readers */}
      <div ref={scrollRef} className="h-44 overflow-y-auto my-2 space-y-2 text-sm pr-1" aria-live="polite" aria-label={hi ? "बातचीत" : "Conversation"}>
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "flex gap-1.5 items-start"}>
            {m.role !== "user" && (
              <span className="sms-thread-dot !w-6 !h-6 text-xs" aria-hidden="true">
                मि
              </span>
            )}
            <span
              className={
                m.role === "user"
                  ? "bg-khet-700 text-white inline-block px-2.5 py-1.5 rounded-2xl rounded-tr-md max-w-[85%]"
                  : "bg-khet-50 border border-khet-200 inline-block px-2.5 py-1.5 rounded-2xl rounded-tl-md max-w-[90%]"
              }
              style={{ whiteSpace: "pre-wrap" }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {busy && (
          <div className="flex gap-1.5 items-center">
            <span className="sms-thread-dot !w-6 !h-6 text-xs animate-pulse" aria-hidden="true">
              मि
            </span>
            <span className="inline-flex gap-1 bg-khet-50 border border-khet-200 px-3 py-2 rounded-2xl" aria-hidden="true">
              <span className="w-1.5 h-1.5 rounded-full bg-khet-600 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-khet-600 animate-bounce" style={{ animationDelay: ".15s" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-khet-600 animate-bounce" style={{ animationDelay: ".3s" }} />
            </span>
          </div>
        )}
      </div>

      {/* Quick asks */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {QUICK.map((q) => (
          <button key={q.hi} type="button" className="chip !text-xs" onClick={() => send(hi ? q.hi : q.en)} disabled={busy}>
            {hi ? q.hi : q.en}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <label htmlFor="mitra-input" className="sr-only">
          {hi ? "अपना सवाल लिखें" : "Type your question"}
        </label>
        <input
          id="mitra-input"
          className="flex-1 border border-khet-300 rounded-xl px-3 min-h-[56px] text-[16px] bg-white"
          value={inp}
          onChange={(e) => setInp(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={hi ? "लिखें या बोलें…" : "Type or speak…"}
          autoComplete="off"
        />
        <button
          type="button"
          className={`mic-big ${listening ? "listening" : ""}`}
          onClick={voice}
          aria-label={hi ? "बोलकर पूछें (56px बड़ा बटन)" : "Ask by voice (large 56px button)"}
          aria-pressed={listening}
          title={hi ? "माइक दबाकर बोलें" : "Hold to speak"}
        >
          {listening ? "⏹️" : "🎙️"}
        </button>
        <button
          type="button"
          className="btn !rounded-full !px-0 w-14 h-14 !min-h-[56px] text-xl shrink-0"
          onClick={() => send()}
          disabled={busy}
          aria-label={hi ? "भेजें" : "Send"}
        >
          ➤
        </button>
      </div>
      <p className="sr-only" aria-live="assertive">
        {listening ? (hi ? "सुन रहे हैं… बोलें" : "Listening… speak now") : ""}
      </p>
      {voiceHint ? (
        <p className="text-xs text-khet-800 mt-1.5 font-semibold bg-haldi-100 border border-haldi-400/50 rounded-lg px-2 py-1">{voiceHint}</p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1">{hi ? "🎙️ बड़ा माइक दबाकर बोलें — अनपढ़ किसान भी use कर सके" : "Tap the big mic to speak"}</p>
      )}
    </div>
  );
}
