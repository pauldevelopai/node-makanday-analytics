/**
 * lib/playground/makanday-analytics/server/ingest.js
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

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december";

const strip = s =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .trim();

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

    const reachM = matrix.match(/reach\s*([\d,\.]+)/i);
    const reach = reachM ? parseInt(reachM[1].replace(/[,\.]/g, ""), 10) : null;
    const engM = [...matrix.matchAll(/engagement\s*([\d,]+)/gi)];
    let engagement = engM.length
      ? parseInt(engM[engM.length - 1][1].replace(/,/g, ""), 10)
      : null;
    if (engagement === null) {
      const all = [...matrix.matchAll(/reach\s*([\d,]+)/gi)];
      if (all.length >= 2) {
        engagement = parseInt(all[all.length - 1][1].replace(/,/g, ""), 10);
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
 * @param {PlaygroundHost} host
 * @param {Buffer} buffer       the uploaded .docx (convert .doc upstream)
 * @param {string} sourceLabel  filename / cohort tag
 */
export async function ingestMatrix(host, buffer, sourceLabel) {
  const html = await host.parse.docxToHtml(buffer);
  const { rows, issues } = parseMatrixHtml(html);
  if (!rows.length) throw new Error("No story rows parsed — is this the matrix table?");
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
