// Honest source badge — every live/mock fallback is labelled, never silent.
// source values: gemini-live | openweather-live | agmarknet-live | places-live | msg91-live | twilio-live
//                mock | owm-error | agmarknet-static-csv | agmarknet-csv-fallback | mock-static | places-fallback | mock-log | *-error
export default function SourceBadge({ source = "", cached = false, stale = false, extra = "" }) {
  const s = String(source || "").toLowerCase();
  const isLive = /live$/.test(s) && !/fallback|error/.test(s);
  const isError = /error|fallback/.test(s);
  const isStaleCsv = /static-csv|csv/.test(s) || stale;
  let label = "● MOCK";
  let cls = "source-badge mock";
  if (isLive) { label = "● LIVE"; cls = "source-badge live"; }
  else if (isError) { label = "● RETRY·FALLBACK"; cls = "source-badge err"; }
  else if (isStaleCsv) { label = "● CSV·STALE?"; cls = "source-badge stale"; }
  else if (!s || s === "mock" || s === "mock-log" || s === "mock-static") { label = "● MOCK"; cls = "source-badge mock"; }
  else { label = `● ${s.toUpperCase()}`; cls = "source-badge mock"; }
  return (
    <span className={cls} title={`src: ${source || "mock"}${cached ? " · cached" : ""}${extra ? ` · ${extra}` : ""}`}>
      {label}
      {cached ? " · cached" : ""}
      {source ? ` · ${source}` : ""}
    </span>
  );
}
