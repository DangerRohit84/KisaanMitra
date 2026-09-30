// KisaanMitra single Genkit flow: agriAdvise
// KISS: one flow handles diagnose + chat. Gemini 1.5 Flash ONLY (p95 < 2.5s target).
// RAG: injects backend/data/agronomy_brief.md into prompt (stands in for 5-page PDF).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIEF_PATH = path.join(__dirname, "..", "data", "agronomy_brief.md");

export function loadBrief() {
  try {
    return fs.readFileSync(BRIEF_PATH, "utf8").slice(0, 6000);
  } catch {
    return "Follow SAU guidance. Confirm dosage with agri officer.";
  }
}

const DISCLAIMER_HI =
  "सलाह केवल संकेतात्मक है — छिड़काव से पहले कृषि अधिकारी से पुष्टि करें। KCC: 1800-180-1551।";
const DISCLAIMER_EN =
  "Advisory is indicative only — confirm with agri officer before spraying. KCC: 1800-180-1551.";

export function buildDiagnosePrompt({ lang = "hi" }) {
  const brief = loadBrief();
  const outLang = lang === "hi" ? "Hindi (simple, farmer-friendly)" : "simple English";
  return `You are KisaanMitra, a farm adviser for small/marginal Indian farmers.
Respond in ${outLang}. Analyse the leaf photo + return STRICT JSON:
{"disease": "...", "confidence": 0.0-1.0, "remedy": "...", "dosage": "...", "urgency": "low|medium|high"}
Rules: use RAG brief below first; if unsure say "suspected" + lower confidence;
dosage MUST quote label/SAU + advise officer confirmation; remedy <= 60 words; urgency high if >30% spread risk.
RAG BRIEF:\n${brief}`;
}

export function buildChatPrompt({ lang = "hi", history = [] }) {
  const brief = loadBrief();
  const outLang = lang === "hi" ? "Hindi (simple)" : "simple English";
  const hist = history.slice(-6).map((m) => `${m.role}: ${m.text}`).join("\n");
  return `You are KisaanMitra voice-first farm assistant. Reply in ${outLang}, <=70 words, actionable.
Use RAG brief when relevant. Always end with one follow-up question or next step.
Conversation:\n${hist}\nRAG:\n${brief}`;
}

export function disclaimers(lang) {
  return lang === "hi" ? DISCLAIMER_HI : DISCLAIMER_EN;
}

// Optional Genkit registration. If genkit packages + GOOGLE key exist, server.js
// will call registerAgriAdvise() to expose a real flow; otherwise these pure
// prompt-builders are used with direct Gemini AI Studio REST calls (or mock).
export async function registerAgriAdvise() {
  try {
    const { genkit } = await import("genkit");
    const { googleAI } = await import("@genkit-ai/googleai");
    const ai = genkit({ plugins: [googleAI()], model: "googleai/gemini-1.5-flash" });
    const agriAdvise = ai.defineFlow(
      { name: "agriAdvise", inputSchema: undefined, outputSchema: undefined },
      async (input) => {
        const { kind = "chat", lang = "hi", text = "", history = [] } = input || {};
        const prompt =
          kind === "diagnose-tier" ? buildDiagnosePrompt({ lang }) : buildChatPrompt({ lang, history: [...history, { role: "user", text }] });
        const out = await ai.generate({ prompt: text ? `${prompt}\n\nFarmer: ${text}` : prompt });
        return { text: out.text, disclaimer: disclaimers(lang) };
      }
    );
    return { ai, agriAdvise };
  } catch (e) {
    console.warn("[genkit] not initialised, using direct Gemini/mock fallback:", e.message);
    return null;
  }
}
