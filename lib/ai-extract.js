/**
 * lib/ai-extract.js — structure raw document text into matrix rows with the AI.
 *
 * Used for .doc / PDF (and as a fallback when a .docx table can't be parsed by
 * the deterministic regex path). Returns the SAME { rows, issues } shape that
 * parseMatrixHtml produces, so ingest.js treats both paths identically.
 *
 * Output is TAB-separated lines (not JSON): far fewer tokens than JSON, and it
 * degrades gracefully — if the model's reply is cut off, we simply lose the
 * last line instead of failing to parse the whole thing.
 */

const TYPES = ["Investigation", "Opinion", "Editorial", "News/Article", "Uncategorised"];
const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"];

const SYSTEM = `You convert a newsroom's published-story performance matrix into rows.
The text comes from a Word or PDF document listing stories and their Facebook reach and engagement.

Output ONE story per line. Separate the fields with a single TAB character, in EXACTLY this order:
number<TAB>title<TAB>date<TAB>reach<TAB>engagement<TAB>type

- number: the story's integer number/index.
- title: the headline or description, with URLs removed. Never put a tab inside the title.
- date: like "3 March 2025" if a date is present; otherwise leave the field empty.
- reach: integer only, commas/spaces stripped (e.g. 12,345 -> 12345). Empty if unknown.
- engagement: integer only, same rules. Empty if unknown.
- type: one of Investigation, Opinion, Editorial, News/Article, Uncategorised.

Output ONLY the lines — no header row, no commentary, no code fences. Preserve the document's order. Do not invent stories that aren't in the text.`;

const toInt = (v) => {
  const s = String(v == null ? "" : v).replace(/[^\d]/g, "");
  return s ? parseInt(s, 10) : null;
};

export function parseAiTsv(out) {
  const rows = [];
  const issues = [];
  const seen = new Map();
  const clean = String(out || "").replace(/```[a-z]*\n?/gi, "").trim();

  for (const line of clean.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split("\t");
    const num = (f[0] || "").replace(/[^\d]/g, "");
    if (!/^\d+$/.test(num)) continue;            // skip headers / prose
    const n = parseInt(num, 10);

    const title = (f[1] || "").replace(/https?:\/\/\S+/g, "").trim();
    const date = (f[2] || "").trim();
    const reach = toInt(f[3]);
    const engagement = toInt(f[4]);
    let type = (f[5] || "").trim();
    if (!TYPES.includes(type)) type = "Uncategorised";

    let month = "";
    const dm = date.match(new RegExp(`(${MONTHS.join("|")})`, "i"));
    if (dm) month = dm[1][0].toUpperCase() + dm[1].slice(1).toLowerCase();

    if (!title) issues.push({ n, level: "error", field: "title", msg: "empty title" });
    if (!date) issues.push({ n, level: "warn", field: "date", msg: "no parseable date" });
    if (reach === null) issues.push({ n, level: "error", field: "reach", msg: "no reach value" });
    if (engagement === null) issues.push({ n, level: "error", field: "engagement", msg: "no engagement value" });
    if (type === "Uncategorised") issues.push({ n, level: "info", field: "type", msg: "no format tag" });
    if (seen.has(n)) issues.push({ n, level: "warn", field: "n", msg: `duplicate story number (also row ${seen.get(n)})` });
    seen.set(n, rows.length + 1);

    if (reach !== null && engagement !== null && title) {
      rows.push({ n, title, month, date, reach, engagement, type });
    }
  }
  rows.sort((a, b) => a.n - b.n);
  return { rows, issues };
}

export async function aiExtractRows(host, text) {
  const input = String(text || "").slice(0, 120000); // cap input (~30k tokens)
  if (!input.trim()) return { rows: [], issues: [] };

  let out;
  try {
    ({ text: out } = await host.ai.chat(
      [{ role: "user", content: input }],
      { system: SYSTEM, maxTokens: 8192 }
    ));
  } catch (e) {
    // The deterministic .docx path needs no AI; .doc/PDF do.
    throw new Error(`Reading this file needs an AI key (Word .docx files don't, but .doc/PDF do). ${e.message}`);
  }
  return parseAiTsv(out);
}
