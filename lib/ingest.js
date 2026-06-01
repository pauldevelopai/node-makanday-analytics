/**
 * lib/ingest.js
 *
 * Turns an uploaded "Social Media Matrix" Word doc into newsroom-scoped rows
 * + a data-quality report. Pure parsing logic; all IO goes through the host
 * facade (host.parse for docx, host.db for persistence). No fs, no standalone
 * mammoth/dotenv/express — those belonged to the standalone prototype and are
 * provided by GROUNDED core now.
 *
 * Newsroom-editable. The parsing heuristics here are exactly the ones proven
 * against the real MakanDay .doc (120 rows, 0 errors, 3 quirks flagged).
 */

import { detectFormat, pdfToText, docToText, htmlToText } from "./extract.js";
import { aiExtractRows } from "./ai-extract.js";

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const strip = s =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .trim();

// Reach and engagement are integer counts. Commas, dots and spaces are all just
// thousands separators here (1,307 / 1.307 / 1 307 all mean 1307), so strip every
// non-digit. Used for both fields so they parse identically.
const toCount = s => {
  const digits = String(s == null ? "" : s).replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : null;
};

export function parseMatrixHtml(html) {
  const rows = [];
  const issues = [];
  const seen = new Map();
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trs) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(strip);
    if (cells.length < 3) continue;
    const num = cells[0].replace(/[^\d]/g, "");
    if (!/^\d+$/.test(num)) continue;

    const n = parseInt(num, 10);
    let desc = cells[1].replace(/https?:\/\/\S+/g, "").replace(/\*+/g, "").trim();
    const matrix = cells[2];

    const dm = desc.match(
      new RegExp(`(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})\\s*(\\d{4})?`, "i")
    );
    let title, month = "", date = "";
    if (dm) {
      title = desc.slice(0, dm.index).trim();
      month = dm[2][0].toUpperCase() + dm[2].slice(1).toLowerCase();
      date = `${dm[1]} ${month} ${dm[3] || "2025"}`;
    } else {
      title = desc;
      issues.push({ n, level: "warn", field: "date", msg: "no parseable date in description" });
    }
    title = title.replace(/^[\s\-–—|:•]+|[\s\-–—|:]+$/g, "").trim();
    if (!title) issues.push({ n, level: "error", field: "title", msg: "empty title after cleaning" });

    const reachM = matrix.match(/reach\s*([\d.,]+)/i);
    const reach = reachM ? toCount(reachM[1]) : null;
    const engM = [...matrix.matchAll(/engagement\s*([\d.,]+)/gi)];
    let engagement = engM.length ? toCount(engM[engM.length - 1][1]) : null;
    if (engagement === null) {
      const all = [...matrix.matchAll(/reach\s*([\d.,]+)/gi)];
      if (all.length >= 2) {
        engagement = toCount(all[all.length - 1][1]);
        issues.push({ n, level: "warn", field: "engagement", msg: 'recovered from "reach" typo' });
      }
    }
    if (reach === null) issues.push({ n, level: "error", field: "reach", msg: "no reach value" });
    if (engagement === null) issues.push({ n, level: "error", field: "engagement", msg: "no engagement value" });

    const tm = matrix.match(/\(([^)]*)\)\s*$/);
    const raw = tm ? tm[1].toLowerCase() : "";
    let type = "Uncategorised";
    if (/invest/.test(raw)) type = "Investigation";
    else if (/opinion/.test(raw) || /^opinion\b/i.test(title)) type = "Opinion";
    else if (/editorial/.test(raw)) type = "Editorial";
    else if (/news|article/.test(raw)) type = "News/Article";
    if (type === "Uncategorised") issues.push({ n, level: "info", field: "type", msg: "no format tag" });

    if (seen.has(n)) issues.push({ n, level: "warn", field: "n", msg: `duplicate story number (also row ${seen.get(n)})` });
    seen.set(n, rows.length + 1);

    if (reach !== null && engagement !== null) {
      rows.push({ n, title, month, date, reach, engagement, type });
    }
  }
  rows.sort((a, b) => a.n - b.n);
  return { rows, issues };
}

function summarise(rows, issues) {
  const by = lvl => issues.filter(i => i.level === lvl).length;
  return {
    storyCount: rows.length,
    errors: by("error"),
    warnings: by("warn"),
    info: by("info"),
    uncategorised: rows.filter(r => r.type === "Uncategorised").length,
    issues
  };
}

/**
 * Ingest a matrix buffer into the current newsroom's scoped tables.
 *
 * Format-aware: .docx is read with the proven, free, deterministic table parse;
 * .doc and PDF (and any .docx whose table can't be parsed) have their text
 * extracted and structured by the AI. Both paths yield the same { rows, issues }.
 *
 * @param {PlaygroundHost} host
 * @param {Buffer} buffer       the uploaded file (.docx | .doc | .pdf)
 * @param {string} sourceLabel  filename / cohort tag
 */
export async function ingestMatrix(host, buffer, sourceLabel) {
  const fmt = detectFormat(buffer);
  if (fmt === "docx-truncated") {
    throw new Error("This Word file looks cut off (incomplete) — the upload was truncated in transit, not a problem with your document. Please try uploading it again.");
  }
  if (fmt === "unknown") {
    throw new Error("Unsupported file. Please upload a Word document (.docx or .doc) or a PDF.");
  }

  let rows, issues;
  if (fmt === "docx") {
    const html = await host.parse.docxToHtml(buffer);
    ({ rows, issues } = parseMatrixHtml(html));
    // Unusual table layout the regex can't read → let the AI read the text.
    if (!rows.length) ({ rows, issues } = await aiExtractRows(host, htmlToText(html)));
  } else {
    // .doc / .pdf carry no clean table — extract text and let the AI structure it.
    const text = fmt === "pdf" ? await pdfToText(buffer) : await docToText(buffer);
    ({ rows, issues } = await aiExtractRows(host, text));
  }

  if (!rows.length) throw new Error("No story rows could be read from this file — is it the social-media matrix?");
  const quality = summarise(rows, issues);

  const T = host.tablePrefix;
  await host.db.tx(async scoped => {
    await scoped.query(
      `${T}stories`,
      `DELETE FROM ${T}stories WHERE newsroom_id = $1 AND source_label = $2`,
      [sourceLabel]
    );
    for (const r of rows) {
      await scoped.query(
        `${T}stories`,
        `INSERT INTO ${T}stories
           (newsroom_id, source_label, n, title, month, story_date, reach, engagement, type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sourceLabel, r.n, r.title, r.month, r.date, r.reach, r.engagement, r.type]
      );
    }
    await scoped.query(
      `${T}quality`,
      `INSERT INTO ${T}quality
         (newsroom_id, source_label, story_count, errors, warnings, info, uncategorised, issues)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sourceLabel, quality.storyCount, quality.errors, quality.warnings,
       quality.info, quality.uncategorised, JSON.stringify(quality.issues)]
    );
  });

  return { storyCount: rows.length, quality };
}
