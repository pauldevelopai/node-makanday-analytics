/**
 * lib/ai-beats.js — fit a beat taxonomy to a newsroom's actual coverage.
 *
 * The default taxonomy (lib/beats.js DEFAULT_BEATS) is generic. When a newsroom
 * asks to "fit beats to my coverage", this reads their headlines and asks the AI
 * to propose 6-10 beats, each as a name + a handful of keywords. The result is
 * stored and compiled (compileBeats) into the same { name: RegExp } shape the
 * deterministic tagger uses — so tagging stays fast, free, and offline after the
 * one-time fit, and the newsroom can still inspect/edit the keywords.
 *
 * Output is TAB-separated (name<TAB>kw1, kw2, ...), same rationale as ai-extract:
 * far fewer tokens than JSON and it degrades gracefully if the reply is cut off.
 */

const MAX_TITLES = 400;     // bound the prompt; more than enough to find the beats
const MIN_BEATS = 3;
const MAX_BEATS = 12;

const SYSTEM = `You are a newsroom editor. You will see a list of published story headlines.
Group them into the newsroom's main coverage BEATS — the topics they actually cover.

Output ONE beat per line. Separate the fields with a single TAB, in EXACTLY this order:
beat name<TAB>keyword1, keyword2, keyword3, ...

- Propose ${MIN_BEATS}-${MAX_BEATS} beats that together cover most of the headlines.
- beat name: 1-4 words, Title Case (e.g. "Health & medicine", "Local politics").
- keywords: 4-10 lowercase words/short phrases that signal that beat, comma-separated.
  Use words that appear in (or strongly imply) the headlines. Plain words only —
  no regex, no quotes, no slashes.
- Make beats distinct; don't output near-duplicates.

Output ONLY the beat lines — no header, no commentary, no code fences.`;

/** Parse the model's TSV into [{ name, keywords[] }]. Forgiving by design. */
export function parseBeatsTsv(out) {
  const clean = String(out || "").replace(/```[a-z]*\n?/gi, "").trim();
  const beats = [];
  const seen = new Set();
  for (const line of clean.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Accept tab OR a "name: kw, kw" fallback if the model used a colon.
    let [rawName, rawKws] = line.includes("\t") ? line.split("\t") : line.split(/:(.+)/);
    const name = String(rawName || "").replace(/^[\s\-*•\d.]+/, "").trim();
    if (!name || /^(beat|name|keywords?)\b/i.test(name)) continue;   // skip a header row
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const keywords = String(rawKws || "")
      .split(/[,;|]/).map(k => k.trim().toLowerCase()).filter(Boolean);
    if (!keywords.length) continue;
    seen.add(key);
    beats.push({ name, keywords: keywords.slice(0, 12) });
    if (beats.length >= MAX_BEATS) break;
  }
  return beats;
}

/**
 * Derive a fitted taxonomy from a list of headlines. Returns [{name, keywords[]}].
 * Throws (with a clear message) if no AI key is configured or nothing usable came
 * back — callers treat that as "keep the existing/default beats".
 */
export async function deriveBeats(host, titles) {
  const list = (Array.isArray(titles) ? titles : []).map(t => String(t || "").trim()).filter(Boolean);
  if (list.length < 5) throw new Error("Not enough stories to fit beats — upload more first.");
  const input = list.slice(0, MAX_TITLES).map((t, i) => `${i + 1}. ${t}`).join("\n");

  let out;
  try {
    ({ text: out } = await host.ai.chat(
      [{ role: "user", content: input }],
      { system: SYSTEM, maxTokens: 1200 }
    ));
  } catch (e) {
    throw new Error(`Fitting beats needs an AI key. ${e.message}`);
  }

  const beats = parseBeatsTsv(out);
  if (beats.length < MIN_BEATS) throw new Error("The AI couldn't find clear beats in these headlines.");
  return beats;
}
