/**
 * lib/playground/makanday-analytics/server/handlers.js
 *
 * Pure handler functions. Each is framework-agnostic: it takes the host facade
 * (already newsroom-scoped) plus parsed input, and returns plain data. The thin
 * Next.js App Router route files under app/playground/makanday-analytics/api/*
 * just (a) resolve the session, (b) build the host, (c) call these, (d) json().
 *
 * Keeping handlers framework-free means the analytics core + these handlers are
 * fully unit-testable without standing up Next, and the eventual graduation
 * into the `audience` agent is a lift-and-shift of this file + core/, not a
 * rewrite.
 */

import { fullReport } from "./analytics.js";
import { ingestMatrix } from "./ingest.js";

const T = host => host.tablePrefix;

async function loadRows(host, sourceLabel) {
  const t = `${T(host)}stories`;
  const sql = sourceLabel
    ? `SELECT n,title,month,story_date,reach,engagement,type
         FROM ${t} WHERE newsroom_id = $1 AND source_label = $2 ORDER BY n`
    : `SELECT n,title,month,story_date,reach,engagement,type
         FROM ${t} WHERE newsroom_id = $1 ORDER BY n`;
  const res = await host.db.query(t, sql, sourceLabel ? [sourceLabel] : []);
  return res.rows.map(r => ({
    n: r.n, title: r.title, month: r.month, date: r.story_date,
    reach: r.reach, engagement: r.engagement, type: r.type
  }));
}

/** GET — list ingested sources for this newsroom. */
export async function listSources(host) {
  const t = `${T(host)}stories`;
  const res = await host.db.query(
    t,
    `SELECT source_label, COUNT(*)::int AS n
       FROM ${t} WHERE newsroom_id = $1 GROUP BY source_label ORDER BY source_label`
  );
  return res.rows;
}

/** GET — full computed report for a source (defaults to all rows). */
export async function getReport(host, { source } = {}) {
  const rows = await loadRows(host, source);
  if (!rows.length) return { empty: true };
  return fullReport(rows);
}

/** GET — data-quality report (drives the mentoring conversation). */
export async function getQuality(host, { source } = {}) {
  const t = `${T(host)}quality`;
  const sql = source
    ? `SELECT * FROM ${t} WHERE newsroom_id = $1 AND source_label = $2
         ORDER BY ingested_at DESC LIMIT 1`
    : `SELECT * FROM ${t} WHERE newsroom_id = $1
         ORDER BY ingested_at DESC LIMIT 1`;
  const res = await host.db.query(t, sql, source ? [source] : []);
  return res.rows[0] || { empty: true };
}

/** POST — ingest an uploaded matrix buffer. */
export async function postIngest(host, { buffer, sourceLabel }) {
  if (!buffer) throw new Error("no file");
  return ingestMatrix(host, buffer, sourceLabel || "matrix");
}

/** POST — AI editorial brief. Uses host.ai.chat (Haiku-only, logged, fallback). */
export async function postBrief(host, { source } = {}) {
  const rows = await loadRows(host, source);
  if (!rows.length) throw new Error("nothing ingested");
  const r = fullReport(rows);

  const ctx = [
    `${r.topline.stories} stories. Metric = Facebook engagement RATE (engagement ÷ reach). Raw reach is inflated by boosting/algorithm; rate is the true resonance signal.`,
    `\nBEATS (median rate%):\n` + r.byBeat.map(b => `${b.beat}: n=${b.n}, rate ${b.medianRate}%, reach ${b.medianReach}`).join("\n"),
    `\nTOP BY RATE:\n` + r.signalLeaders.slice(0, 8).map(d => `"${d.title}" — ${d.rate.toFixed(2)}% (reach ${d.reach})`).join("\n"),
    `\nLOUD BUT WEAK:\n` + r.reachGiants.slice(0, 6).map(d => `"${d.title}" — reach ${d.reach}, only ${d.rate.toFixed(2)}%`).join("\n"),
    `\nRISING/FADING:\n` + r.risingFading.map(x => `${x.beat}: ${x.earlyRate}% → ${x.lateRate}% (${x.direction})`).join("\n"),
    `\nFORMAT:\n` + r.byFormat.map(f => `${f.type}: n=${f.n}, ${f.medianRate}%`).join("\n")
  ].join("\n");

  const prompt =
    `You are an editorial-intelligence analyst briefing the editor of an African investigative newsroom. Below is owned-data audience resonance — what their existing audience already rewards.\n\n${ctx}\n\n` +
    `Write a decisive brief. Exact section headers, each prefixed "## ":\n` +
    `## The signal\n## Commission more\n## Loud but hollow\n## Test next\n\n` +
    `2-4 tight sentences or "- " bullets per section. Name specific beats/patterns from the data. ` +
    `No preamble, no data-quality caveats. Under 320 words.`;

  const { text, usedFallback } = await host.ai.chat(prompt, { maxTokens: 1000 });
  await host.log.run({ kind: "brief", source: source || "all", usedFallback: !!usedFallback });
  return { brief: text, usedFallback: !!usedFallback };
}
