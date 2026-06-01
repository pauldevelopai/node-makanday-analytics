/**
 * lib/csv.js — read a spreadsheet (CSV/TSV) into matrix rows.
 *
 * Lets a newsroom feed Audience Signal from a Google Sheet or a CSV export
 * instead of a Word doc. Pure, dependency-free: an RFC-4180-ish parser (handles
 * quoted fields, embedded commas/newlines, "" escapes) plus a fuzzy column
 * mapper that finds the headline / reach / engagement / date / type columns by
 * their header names, however the newsroom labelled them. Same { rows, issues }
 * shape the Word/PDF paths produce, so ingest.js treats it identically.
 */

const MONTHS = ["january","february","march","april","may","june",
  "july","august","september","october","november","december"];

/** Parse delimited text into an array of string-arrays. Auto-detects , vs \t. */
export function parseDelimited(text, delimiter) {
  const s = String(text || "").replace(/^﻿/, "");   // strip BOM
  if (!delimiter) {
    const firstLine = s.slice(0, s.indexOf("\n") >= 0 ? s.indexOf("\n") : s.length);
    delimiter = (firstLine.split("\t").length > firstLine.split(",").length) ? "\t" : ",";
  }
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); field = ""; row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));   // drop blank lines
}

const norm = h => String(h || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Map a header name to one of our fields. First matching pattern wins, so the
// more specific readership columns sit before the generic reach pattern.
const COLUMN_PATTERNS = [
  ["title",          /\b(title|headline|story|post|content|caption|name)\b/],
  ["url",            /\b(url|link|permalink|story url|post url|href|web address)\b/],
  ["unique_readers", /\b(unique|unique readers|unique users|unique visitors|visitors|readers)\b/],
  ["pageviews",      /\b(pageviews|page views|sessions|hits)\b/],
  ["reach",          /\b(reach|impression|impressions|views|seen|reached)\b/],
  ["engagement",     /\b(engagement|engagements|reactions|interactions|likes|total interactions|eng)\b/],
  ["date",           /\b(date|published|publish|posted|time|day)\b/],
  ["type",           /\b(type|format|category|section|genre)\b/],
  ["n",              /\b(n|no|num|number|rank|index)\b/],
];

const URL_RE = /https?:\/\/\S+/;

function mapColumns(header) {
  const map = {};
  header.forEach((raw, i) => {
    const h = norm(raw);
    for (const [field, re] of COLUMN_PATTERNS) {
      if (map[field] === undefined && re.test(h)) { map[field] = i; break; }
    }
  });
  return map;
}

const toCount = v => {
  const d = String(v == null ? "" : v).replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};

function monthFrom(dateStr) {
  const m = String(dateStr || "").toLowerCase().match(new RegExp(`(${MONTHS.join("|")})`));
  if (m) return m[1][0].toUpperCase() + m[1].slice(1);
  // numeric date like 2025-03-05 or 05/03/2025 → take the month number if ISO.
  const iso = String(dateStr || "").match(/^\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return MONTHS[(+iso[2]) - 1] ? MONTHS[(+iso[2]) - 1][0].toUpperCase() + MONTHS[(+iso[2]) - 1].slice(1) : "";
  return "";
}

const TYPES = ["Investigation", "Opinion", "Editorial", "News/Article", "Uncategorised"];
function normType(raw) {
  const t = String(raw || "").toLowerCase();
  if (/invest/.test(t)) return "Investigation";
  if (/opinion/.test(t)) return "Opinion";
  if (/editorial/.test(t)) return "Editorial";
  if (/news|article|report/.test(t)) return "News/Article";
  return TYPES.includes(raw) ? raw : "Uncategorised";
}

/**
 * Turn delimited text into { rows, issues }. Requires a header row and at least
 * a title column plus reach + engagement.
 */
export function csvToMatrix(text) {
  const table = parseDelimited(text);
  if (table.length < 2) return { rows: [], issues: [{ n: 0, level: "error", field: "file", msg: "No data rows found in the sheet/CSV." }] };

  const header = table[0];
  const col = mapColumns(header);
  const issues = [];
  if (col.title === undefined) issues.push({ n: 0, level: "error", field: "title", msg: "Couldn't find a headline/title column. Name one column 'title' or 'headline'." });
  if (col.reach === undefined) issues.push({ n: 0, level: "error", field: "reach", msg: "Couldn't find a reach/impressions column." });
  if (col.engagement === undefined) issues.push({ n: 0, level: "error", field: "engagement", msg: "Couldn't find an engagement/interactions column." });
  if (col.title === undefined || col.reach === undefined || col.engagement === undefined) return { rows: [], issues };

  const rows = [];
  const seen = new Map();
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const n = col.n !== undefined ? (toCount(cells[col.n]) ?? r) : r;
    const rawTitle = String(cells[col.title] || "");
    const title = rawTitle.replace(/https?:\/\/\S+/g, "").trim();
    // url: an explicit column wins; otherwise recover a link embedded in the title.
    let url = col.url !== undefined ? String(cells[col.url] || "").trim() : "";
    if (!url) url = (rawTitle.match(URL_RE) || [])[0] || "";
    if (url && !URL_RE.test(url)) url = "";
    const dateRaw = col.date !== undefined ? String(cells[col.date] || "").trim() : "";
    const reach = toCount(cells[col.reach]);
    const engagement = toCount(cells[col.engagement]);
    const unique_readers = col.unique_readers !== undefined ? toCount(cells[col.unique_readers]) : null;
    const pageviews = col.pageviews !== undefined ? toCount(cells[col.pageviews]) : null;
    const type = col.type !== undefined ? normType(cells[col.type]) : "Uncategorised";
    const month = monthFrom(dateRaw);

    if (!title) { issues.push({ n, level: "error", field: "title", msg: "empty title" }); continue; }
    if (!dateRaw) issues.push({ n, level: "warn", field: "date", msg: "no date" });
    if (reach === null) issues.push({ n, level: "error", field: "reach", msg: "no reach value" });
    if (engagement === null) issues.push({ n, level: "error", field: "engagement", msg: "no engagement value" });
    if (type === "Uncategorised") issues.push({ n, level: "info", field: "type", msg: "no format tag" });
    if (seen.has(n)) issues.push({ n, level: "warn", field: "n", msg: `duplicate row number (also row ${seen.get(n)})` });
    seen.set(n, rows.length + 1);

    if (reach !== null && engagement !== null && title) {
      rows.push({ n, title, month, date: dateRaw, reach, engagement, type, url: url || null, unique_readers, pageviews });
    }
  }
  rows.sort((a, b) => a.n - b.n);
  return { rows, issues };
}
