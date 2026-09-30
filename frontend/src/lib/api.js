export async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  // L3 fix: preserve backend error body (was `${path} -> status`, lost {error} JSON). Callers see e.g. "unknown crop".
  if (!r.ok) {
    let detail = "";
    try {
      const txt = await r.text();
      try {
        const j = JSON.parse(txt);
        detail = j.error ? ` — ${j.error}${j.suggestions ? ` (try: ${j.suggestions.join(", ")})` : ""}` : ` — ${txt.slice(0, 200)}`;
      } catch { detail = txt ? ` — ${txt.slice(0, 200)}` : ""; }
    } catch { /* ignore body read errors */ }
    throw new Error(`${path} -> ${r.status}${detail}`);
  }
  return r.json();
}
// Client-side image compress: max 1024px, jpeg 0.7 — keeps uploads fast on 4G + Flash p95<2.5s
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
